// Central text item registry facade.
//
// The orchestrator owns canonical on-screen text items, ownership arbitration,
// translation requests, and render-command dispatch. The implementation is split
// across runtime/text-orchestrator/*.js by responsibility, while this facade
// documents the public API and composes one shared instance scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator',
        requires: {
            constants: 'runtime.textOrchestrator.constants',
            textLifecycle: 'runtime.textLifecycle',
            renderTransaction: 'runtime.renderTransaction',
            baseUtils: 'runtime.textOrchestrator.baseUtils',
            recordUtils: 'runtime.textOrchestrator.recordUtils',
            eligibilityUtils: 'runtime.textOrchestrator.eligibility',
            serviceUtils: 'runtime.textOrchestrator.serviceUtils',
            controllerFacades: 'runtime.textOrchestrator.controllerFacades',
            policyController: 'runtime.textOrchestrator.policy',
            lifecycleController: 'runtime.textOrchestrator.lifecycle',
            ownershipController: 'runtime.textOrchestrator.ownership',
            ownershipSurfaceDrawController: 'runtime.textOrchestrator.ownershipSurfaceDraw',
            requestController: 'runtime.textOrchestrator.request',
            translationStateController: 'runtime.textOrchestrator.translationState',
            renderController: 'runtime.textOrchestrator.render',
            itemsController: 'runtime.textOrchestrator.items',
            eventsController: 'runtime.textOrchestrator.events',
            identityController: 'runtime.textOrchestrator.identity',
            sourceCacheController: 'runtime.textOrchestrator.sourceCache',
            intelController: 'runtime.textOrchestrator.intel',
            historyStore: 'runtime.textOrchestrator.historyStore',
        },
        factory({ constants, textLifecycle, renderTransaction, baseUtils, recordUtils, eligibilityUtils, serviceUtils, controllerFacades, policyController, lifecycleController, ownershipController, ownershipSurfaceDrawController, requestController, translationStateController, renderController, itemsController, eventsController, identityController, sourceCacheController, intelController, historyStore }, { scope: globalScope }) {
            const controllers = {
                controllerFacades,
                policy: policyController,
                lifecycle: lifecycleController,
                ownership: ownershipController,
                ownershipSurfaceDraw: ownershipSurfaceDrawController,
                request: requestController,
                translationState: translationStateController,
                render: renderController,
                items: itemsController,
                events: eventsController,
                identity: identityController,
                sourceCache: sourceCacheController,
                intel: intelController,
            };
            const shared = Object.assign({}, constants, baseUtils, recordUtils, eligibilityUtils, serviceUtils, {
                textLifecycle,
                renderTransaction,
            });

            function resolveIntelPolicy(globalScopeRef, settings) {
                const policy = globalScopeRef && globalScopeRef.LiveTranslatorIntelPolicy;
                function closedPolicy() {
                    return {
                        surface: false,
                        publish: false,
                        captureEvents: false,
                        includeActiveItems: false,
                        includeDetachedItems: false,
                        includeArchivedItems: false,
                        limits: {},
                    };
                }
                const getSnapshotPolicy = policy && typeof policy.getSnapshotPolicy === 'function'
                    ? (optionsArg = {}) => policy.getSnapshotPolicy(Object.assign({
                        globalScope: globalScopeRef,
                        settings,
                    }, optionsArg || {})) || closedPolicy()
                    : closedPolicy;
                return {
                    getSnapshotPolicy,
                    isSurfaceEnabled: () => getSnapshotPolicy().surface === true,
                };
            }

            const noopItemTrailStore = Object.freeze({
                appendItemEvent() {},
                isDuplicateSkippedEvent() { return false; },
                cloneItemHistory() { return []; },
                clear() { return false; },
            });

            function resolveItemTrailStore(globalScopeRef, options) {
                const factory = historyStore && typeof historyStore.createTextOrchestratorTrailStore === 'function'
                    ? historyStore.createTextOrchestratorTrailStore
                    : null;
                if (!factory) return noopItemTrailStore;
                try {
                    return normalizeItemTrailStore(factory(Object.assign({
                        globalScope: globalScopeRef,
                    }, options || {})));
                } catch (_) {
                    return noopItemTrailStore;
                }
            }

            function normalizeItemTrailStore(store) {
                if (!store || typeof store !== 'object') return noopItemTrailStore;
                return {
                    appendItemEvent: typeof store.appendItemEvent === 'function'
                        ? store.appendItemEvent.bind(store)
                        : noopItemTrailStore.appendItemEvent,
                    isDuplicateSkippedEvent: typeof store.isDuplicateSkippedEvent === 'function'
                        ? store.isDuplicateSkippedEvent.bind(store)
                        : noopItemTrailStore.isDuplicateSkippedEvent,
                    cloneItemHistory: typeof store.cloneItemHistory === 'function'
                        ? store.cloneItemHistory.bind(store)
                        : noopItemTrailStore.cloneItemHistory,
                    clear: typeof store.clear === 'function'
                        ? store.clear.bind(store)
                        : noopItemTrailStore.clear,
                };
            }

            function createTextOrchestrator(options = {}) {
                const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
                const orchestratorSettings = settings.textOrchestrator && typeof settings.textOrchestrator === 'object'
                    ? settings.textOrchestrator
                    : {};
                const intelPolicy = resolveIntelPolicy(globalScope, settings);
                const scope = Object.assign({}, shared, {
                    globalScope,
                    settings,
                    orchestratorSettings,
                    intelPolicy,
                    getIntelSnapshotPolicy: intelPolicy.getSnapshotPolicy,
                    isIntelSurfaceEnabled: intelPolicy.isSurfaceEnabled,
                    logger: options.logger || {},
                    preview: typeof options.preview === 'function' ? options.preview : shared.defaultPreview,
                    eventLimit: shared.positiveInteger(orchestratorSettings.eventLimit, constants.DEFAULT_EVENT_LIMIT),
                    itemEventLimit: shared.positiveInteger(orchestratorSettings.itemEventLimit, constants.DEFAULT_ITEM_EVENT_LIMIT),
                    archivedLimit: shared.positiveInteger(orchestratorSettings.archivedLimit, constants.DEFAULT_ARCHIVED_LIMIT),
                    renderCommandLimit: shared.positiveInteger(orchestratorSettings.renderCommandLimit, constants.DEFAULT_RENDER_COMMAND_LIMIT),
                    textEligibility: shared.createTextEligibilityPolicy(settings),
                    providerDispatch: shared.createProviderDispatchPolicy(options),
                    activeItems: new Map(),
                    detachedItems: new Map(),
                    detachedItemsBySlotSignature: new Map(),
                    archivedItems: new Map(),
                    slotIndex: new Map(),
                    ownershipBucketsByTarget: typeof WeakMap !== 'undefined' ? new WeakMap() : null,
                    ownershipClaimsByToken: typeof WeakMap !== 'undefined' ? new WeakMap() : null,
                    textClaimsById: new Map(),
                    surfaceDrawListeners: new Set(),
                    renderCommands: [],
                    events: [],
                    listeners: new Set(),
                    translationService: shared.normalizeTranslationService(options.translationService),
                    sequence: 0,
                    itemSequence: 0,
                    renderSequence: 0,
                    translationSequence: 0,
                    ownershipSequence: 0,
                    publishQueued: false,
                    lastSnapshot: null,
                    detailIntelActive: false,
                    controllerFacades: null,
                });
                scope.itemTrailStore = resolveItemTrailStore(globalScope, {
                    itemEventLimit: scope.itemEventLimit,
                    cloneEvent: scope.cloneIntelEvent,
                });

                const methodControllers = {
                    resolveLifecyclePolicy: 'policy',
                    applyLifecyclePolicy: 'policy',
                    resolveBackgroundPriorityPolicy: 'policy',
                    applyPriorityPolicy: 'policy',
                    applyObservationPolicy: 'policy',
                    applyObservationPriorityPolicy: 'policy',
                    resolveRequestPolicy: 'policy',
                    applyRequestPolicy: 'policy',
                    observeRecord: 'lifecycle',
                    updateItem: 'lifecycle',
                    retireItem: 'lifecycle',
                    invalidateRenderTarget: 'lifecycle',
                    retargetRenderTarget: 'lifecycle',
                    recordDraw: 'lifecycle',
                    recordDecision: 'lifecycle',
                    recordTranslationEvent: 'lifecycle',
                    setTranslationService: 'lifecycle',
                    describeTextEligibility: 'lifecycle',
                    claimSurface: 'ownership',
                    releaseSurface: 'ownership',
                    claimText: 'ownership',
                    finalizeTextClaim: 'ownership',
                    releaseTextClaim: 'ownership',
                    recordSurfaceDraw: 'ownershipSurfaceDraw',
                    subscribeSurfaceDraws: 'ownershipSurfaceDraw',
                    normalizeOwnershipDescriptor: 'ownership',
                    normalizeSurfaceDrawDescriptor: 'ownershipSurfaceDraw',
                    resolveOwnershipTarget: 'ownership',
                    getOwnershipBucket: 'ownership',
                    createOwnershipClaim: 'ownership',
                    getOwnershipClaimForToken: 'ownership',
                    getSurfaceWinner: 'ownership',
                    isLiveOwnershipClaim: 'ownership',
                    preemptLowerPriorityClaims: 'ownership',
                    revokeOwnershipClaim: 'ownership',
                    releaseOwnershipToken: 'ownership',
                    removeClaimFromBucket: 'ownership',
                    findTextOwnershipBlocker: 'ownership',
                    validateObservationOwnership: 'ownership',
                    hasSurfaceDrawListener: 'ownershipSurfaceDraw',
                    emitSurfaceDraw: 'ownershipSurfaceDraw',
                    createSurfaceDrawPayload: 'ownershipSurfaceDraw',
                    createSurfaceDrawResult: 'ownershipSurfaceDraw',
                    createOwnershipDeniedResult: 'ownership',
                    cloneOwnershipResult: 'ownership',
                    getDefaultOwnershipPriority: 'ownership',
                    normalizeOwnershipText: 'ownership',
                    ownershipNumber: 'ownership',
                    requestItemTranslation: 'request',
                    retryFailedTranslations: 'request',
                    refreshJoinedTranslationItem: 'request',
                    shouldReplaceJoinedTranslationSubscriber: 'request',
                    requestWantsStreaming: 'request',
                    cancelSupersededTranslationHandle: 'request',
                    startTranslationRequest: 'request',
                    describeProviderDispatch: 'request',
                    cancelItemTranslation: 'translationState',
                    setItemTranslationPriority: 'translationState',
                    markTranslationRequested: 'translationState',
                    markTranslationSkipped: 'translationState',
                    skipItemTranslation: 'translationState',
                    markCacheHit: 'translationState',
                    markTranslationCompleted: 'translationState',
                    markTranslationNoop: 'translationState',
                    storeDetachedTranslation: 'translationState',
                    storeDetachedTranslationNoop: 'translationState',
                    storeDetachedTranslationSkip: 'translationState',
                    recordDetachedTranslationFailure: 'translationState',
                    setItemPriority: 'translationState',
                    setItemVisibility: 'translationState',
                    backgroundItem: 'translationState',
                    completeItemTranslation: 'translationState',
                    failItemTranslation: 'translationState',
                    queueRenderCommand: 'render',
                    queueStoredRenderCommand: 'render',
                    recordRenderCommitted: 'render',
                    recordRenderDeferred: 'render',
                    recordRenderRejected: 'render',
                    recordRenderSuperseded: 'render',
                    rebaseRenderCommand: 'render',
                    recordRenderCommandDecision: 'render',
                    notifyRenderCommandReady: 'render',
                    rejectOpenRenderCommands: 'render',
                    findRenderCommand: 'render',
                    getUnresolvedRenderCommandsForItem: 'render',
                    normalizeRenderCommandStatus: 'render',
                    normalizeRenderCommandDecision: 'render',
                    updateRenderCommandStatus: 'render',
                    upsertItem: 'items',
                    createEmptyItem: 'items',
                    clearItemTranslationRequest: 'items',
                    setItemRenderCycleFromObservation: 'items',
                    markItemRenderCycleTranslationKnown: 'items',
                    markItemRenderCycleAdmitted: 'items',
                    markItemRenderCycleDecision: 'items',
                    getItemById: 'items',
                    hasItem: 'items',
                    hasLiveTranslationRequest: 'items',
                    moveToActive: 'items',
                    placeInactiveItem: 'items',
                    moveToDetachedItem: 'items',
                    moveToArchive: 'items',
                    indexDetachedItem: 'items',
                    removeDetachedItemIndex: 'items',
                    releaseSlotIndexesForItem: 'items',
                    claimSlotSignature: 'items',
                    resetItemForSourceReplacement: 'items',
                    recordEvent: 'events',
                    appendItemEvent: 'events',
                    isDuplicateSkippedEvent: 'events',
                    subscribe: 'events',
                    notify: 'events',
                    resolveObservationIdentity: 'identity',
                    buildSlotSignature: 'identity',
                    normalizeExplicitObservationId: 'identity',
                    getAvailableExplicitObservationId: 'identity',
                    canObservationUseExistingItem: 'identity',
                    isSameObservationOwner: 'identity',
                    isAdapterOwnedObservationId: 'identity',
                    createAdapterScopedObservationId: 'identity',
                    getObservationOwner: 'identity',
                    isSameObservedText: 'identity',
                    findReusableDetachedItem: 'identity',
                    getRestoredItemStatus: 'identity',
                    shouldPreserveRefreshStatus: 'identity',
                    createGeneratedItemId: 'identity',
                    buildSourceTranslationKey: 'identity',
                    hydrateSourceTranslation: 'sourceCache',
                    getCompletedSourceTranslation: 'sourceCache',
                    rememberSourceTranslation: 'sourceCache',
                    forgetSourceTranslation: 'sourceCache',
                    classifyNoopTranslation: 'sourceCache',
                    getComparableSourceText: 'sourceCache',
                    normalizeComparableText: 'sourceCache',
                    isTranslationNoopRenderRejection: 'sourceCache',
                    reuseCompletedSourceTranslation: 'sourceCache',
                    lookupServiceTranslation: 'sourceCache',
                    describeServiceSkip: 'sourceCache',
                    reuseLookupTranslation: 'sourceCache',
                    isSkippedItem: 'sourceCache',
                    createSkippedTranslationHandle: 'sourceCache',
                    getSnapshot: 'intel',
                    publishNow: 'intel',
                    clearIntel: 'intel',
                    schedulePublish: 'intel',
                };
                const instances = {};
                function getController(key) {
                    if (!instances[key]) instances[key] = controllers[key].create(scope);
                    return instances[key];
                }
                function callController(methodName, ...args) {
                    const key = methodControllers[methodName];
                    const controller = key ? getController(key) : null;
                    const method = controller && controller[methodName];
                    if (typeof method !== 'function') throw new Error('[TextOrchestrator] Missing controller method: ' + methodName);
                    return method(...args);
                }
                scope.controllerFacades = controllers.controllerFacades.create({ callController });
                Object.keys(methodControllers).forEach((methodName) => {
                    scope[methodName] = (...args) => callController(methodName, ...args);
                });

                const intelApi = Object.freeze({
                    getSnapshot: scope.getSnapshot,
                    snapshot: scope.getSnapshot,
                    publish: scope.publishNow,
                    clearIntel: scope.clearIntel,
                });
                const api = Object.freeze({
                    setTranslationService: scope.setTranslationService,
                    observeRecord: scope.observeRecord,
                    updateItem: scope.updateItem,
                    retireItem: scope.retireItem,
                    invalidateRenderTarget: scope.invalidateRenderTarget,
                    retargetRenderTarget: scope.retargetRenderTarget,
                    requestItemTranslation: scope.requestItemTranslation,
                    retryFailedTranslations: scope.retryFailedTranslations,
                    cancelItemTranslation: scope.cancelItemTranslation,
                    setItemTranslationPriority: scope.setItemTranslationPriority,
                    markTranslationRequested: scope.markTranslationRequested,
                    markTranslationSkipped: scope.markTranslationSkipped,
                    markCacheHit: scope.markCacheHit,
                    markTranslationCompleted: scope.markTranslationCompleted,
                    describeTextEligibility: scope.describeTextEligibility,
                    claimSurface: scope.claimSurface,
                    releaseSurface: scope.releaseSurface,
                    claimText: scope.claimText,
                    finalizeTextClaim: scope.finalizeTextClaim,
                    releaseTextClaim: scope.releaseTextClaim,
                    recordSurfaceDraw: scope.recordSurfaceDraw,
                    recordRenderCommitted: scope.recordRenderCommitted,
                    recordRenderDeferred: scope.recordRenderDeferred,
                    recordRenderRejected: scope.recordRenderRejected,
                    recordRenderSuperseded: scope.recordRenderSuperseded,
                    rebaseRenderCommand: scope.rebaseRenderCommand,
                    notifyRenderCommandReady: scope.notifyRenderCommandReady,
                    subscribeSurfaceDraws: scope.subscribeSurfaceDraws,
                    setItemPriority: scope.setItemPriority,
                    setItemVisibility: scope.setItemVisibility,
                    backgroundItem: scope.backgroundItem,
                    queueRenderCommand: scope.queueRenderCommand,
                    queueStoredRenderCommand: scope.queueStoredRenderCommand,
                    getUnresolvedRenderCommandsForItem: scope.getUnresolvedRenderCommandsForItem,
                    recordDecision: scope.recordDecision,
                    recordTranslationEvent: scope.recordTranslationEvent,
                    subscribe: scope.subscribe,
                    getSnapshot: scope.getSnapshot,
                    snapshot: scope.getSnapshot,
                    publish: scope.publishNow,
                    clearIntel: scope.clearIntel,
                });

                try { globalScope.LiveTranslatorTextOrchestratorIntel = intelApi; } catch (_) {}
                scope.publishNow();
                if (scope.logger && typeof scope.logger.debug === 'function') {
                    scope.logger.debug('[TextOrchestrator] Text orchestrator initialized.');
                }
                return api;
            }

            return {
                createTextOrchestrator,
            };
        },
    });
})();
