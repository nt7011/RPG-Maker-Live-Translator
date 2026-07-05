// Text orchestrator support: explicit controller dependency facades.
// Child controllers use these facets instead of constructing ad hoc dispatchers.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.controllerFacades',
        factory() {
            function createTextOrchestratorControllerFacades(context = {}) {
                const callController = context.callController;
                if (typeof callController !== 'function') {
                    throw new Error('[TextOrchestrator] controller facades require a controller dispatcher.');
                }

                return Object.freeze({
                    policy: bindControllerMethods(callController, [
                        'resolveLifecyclePolicy',
                        'applyLifecyclePolicy',
                        'resolveBackgroundPriorityPolicy',
                        'applyPriorityPolicy',
                        'applyObservationPolicy',
                        'applyObservationPriorityPolicy',
                        'resolveRequestPolicy',
                        'applyRequestPolicy',
                    ]),
                    lifecycle: bindControllerMethods(callController, [
                        'observeRecord',
                        'updateItem',
                        'retireItem',
                        'invalidateRenderTarget',
                        'retargetRenderTarget',
                        'recordDraw',
                        'recordDecision',
                        'recordTranslationEvent',
                        'setTranslationService',
                        'describeTextEligibility',
                    ]),
                    ownership: bindControllerMethods(callController, [
                        'claimSurface',
                        'releaseSurface',
                        'claimText',
                        'finalizeTextClaim',
                        'releaseTextClaim',
                        'normalizeOwnershipDescriptor',
                        'resolveOwnershipTarget',
                        'getOwnershipBucket',
                        'createOwnershipClaim',
                        'getOwnershipClaimForToken',
                        'getSurfaceWinner',
                        'isLiveOwnershipClaim',
                        'preemptLowerPriorityClaims',
                        'revokeOwnershipClaim',
                        'releaseOwnershipToken',
                        'removeClaimFromBucket',
                        'findTextOwnershipBlocker',
                        'validateObservationOwnership',
                        'createOwnershipDeniedResult',
                        'cloneOwnershipResult',
                        'getDefaultOwnershipPriority',
                        'normalizeOwnershipText',
                        'ownershipNumber',
                    ]),
                    ownershipSurfaceDraw: bindControllerMethods(callController, [
                        'recordSurfaceDraw',
                        'subscribeSurfaceDraws',
                        'normalizeSurfaceDrawDescriptor',
                        'hasSurfaceDrawListener',
                        'emitSurfaceDraw',
                        'createSurfaceDrawPayload',
                        'createSurfaceDrawResult',
                    ]),
                    request: bindControllerMethods(callController, [
                        'requestItemTranslation',
                        'retryFailedTranslations',
                        'refreshJoinedTranslationItem',
                        'shouldReplaceJoinedTranslationSubscriber',
                        'requestWantsStreaming',
                        'cancelSupersededTranslationHandle',
                        'startTranslationRequest',
                        'describeProviderDispatch',
                    ]),
                    translationState: bindControllerMethods(callController, [
                        'cancelItemTranslation',
                        'setItemTranslationPriority',
                        'markTranslationRequested',
                        'markTranslationSkipped',
                        'skipItemTranslation',
                        'markCacheHit',
                        'markTranslationCompleted',
                        'markTranslationNoop',
                        'storeDetachedTranslation',
                        'storeDetachedTranslationNoop',
                        'storeDetachedTranslationSkip',
                        'recordDetachedTranslationFailure',
                        'setItemPriority',
                        'setItemVisibility',
                        'backgroundItem',
                        'completeItemTranslation',
                        'failItemTranslation',
                    ]),
                    render: bindControllerMethods(callController, [
                        'queueRenderCommand',
                        'queueStoredRenderCommand',
                        'recordRenderCommitted',
                        'recordRenderDeferred',
                        'recordRenderRejected',
                        'recordRenderSuperseded',
                        'rebaseRenderCommand',
                        'recordRenderCommandDecision',
                        'notifyRenderCommandReady',
                        'rejectOpenRenderCommands',
                        'findRenderCommand',
                        'getUnresolvedRenderCommandsForItem',
                        'normalizeRenderCommandStatus',
                        'normalizeRenderCommandDecision',
                        'updateRenderCommandStatus',
                    ]),
                    items: bindControllerMethods(callController, [
                        'upsertItem',
                        'createEmptyItem',
                        'clearItemTranslationRequest',
                        'setItemRenderCycleFromObservation',
                        'markItemRenderCycleTranslationKnown',
                        'markItemRenderCycleAdmitted',
                        'markItemRenderCycleDecision',
                        'getItemById',
                        'hasItem',
                        'hasLiveTranslationRequest',
                        'moveToActive',
                        'placeInactiveItem',
                        'moveToDetachedItem',
                        'moveToArchive',
                        'indexDetachedItem',
                        'removeDetachedItemIndex',
                        'releaseSlotIndexesForItem',
                        'claimSlotSignature',
                        'resetItemForSourceReplacement',
                    ]),
                    events: bindControllerMethods(callController, [
                        'recordEvent',
                        'appendItemEvent',
                        'isDuplicateSkippedEvent',
                        'subscribe',
                        'notify',
                    ]),
                    identity: bindControllerMethods(callController, [
                        'resolveObservationIdentity',
                        'buildSlotSignature',
                        'normalizeExplicitObservationId',
                        'getAvailableExplicitObservationId',
                        'canObservationUseExistingItem',
                        'isSameObservationOwner',
                        'isAdapterOwnedObservationId',
                        'createAdapterScopedObservationId',
                        'getObservationOwner',
                        'isSameObservedText',
                        'findReusableDetachedItem',
                        'getRestoredItemStatus',
                        'shouldPreserveRefreshStatus',
                        'createGeneratedItemId',
                        'buildSourceTranslationKey',
                    ]),
                    sourceCache: bindControllerMethods(callController, [
                        'hydrateSourceTranslation',
                        'getCompletedSourceTranslation',
                        'rememberSourceTranslation',
                        'forgetSourceTranslation',
                        'classifyNoopTranslation',
                        'getComparableSourceText',
                        'normalizeComparableText',
                        'isTranslationNoopRenderRejection',
                        'reuseCompletedSourceTranslation',
                        'lookupServiceTranslation',
                        'describeServiceSkip',
                        'reuseLookupTranslation',
                        'isSkippedItem',
                        'createSkippedTranslationHandle',
                    ]),
                    intel: bindControllerMethods(callController, [
                        'getSnapshot',
                        'publishNow',
                        'clearIntel',
                        'schedulePublish',
                    ]),
                });
            }

            function bindControllerMethods(callController, names) {
                const facade = Object.create(null);
                names.forEach((name) => {
                    facade[name] = (...args) => callController(name, ...args);
                });
                return Object.freeze(facade);
            }

            return {
                create: createTextOrchestratorControllerFacades,
            };
        },
    });
})();
