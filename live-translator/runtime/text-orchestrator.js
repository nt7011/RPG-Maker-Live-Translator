// Central text item registry facade.
//
// The orchestrator owns canonical on-screen text items, ownership arbitration,
// translation requests, and render-command dispatch. The implementation is split
// across runtime/text-orchestrator/*.js by responsibility, while this facade
// documents the public API and composes one shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.runtime) globalScope.LiveTranslatorModules.runtime = {};

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before runtime/text-orchestrator.js.');
    }

    const constants = requireRuntimeModule('runtime.textOrchestratorConstants');
    const baseUtils = requireRuntimeModule('runtime.textOrchestratorBaseUtils');
    const recordUtils = requireRuntimeModule('runtime.textOrchestratorRecordUtils');
    const eligibilityUtils = requireRuntimeModule('runtime.textOrchestratorEligibility');
    const serviceUtils = requireRuntimeModule('runtime.textOrchestratorServiceUtils');
    const controllers = {
        policy: requireRuntimeModule('runtime.textOrchestratorPolicy'),
        lifecycle: requireRuntimeModule('runtime.textOrchestratorLifecycle'),
        ownership: requireRuntimeModule('runtime.textOrchestratorOwnership'),
        ownershipSurfaceDraw: requireRuntimeModule('runtime.textOrchestratorOwnershipSurfaceDraw'),
        request: requireRuntimeModule('runtime.textOrchestratorRequest'),
        translationState: requireRuntimeModule('runtime.textOrchestratorTranslationState'),
        render: requireRuntimeModule('runtime.textOrchestratorRender'),
        items: requireRuntimeModule('runtime.textOrchestratorItems'),
        events: requireRuntimeModule('runtime.textOrchestratorEvents'),
        identity: requireRuntimeModule('runtime.textOrchestratorIdentity'),
        sourceCache: requireRuntimeModule('runtime.textOrchestratorSourceCache'),
        diagnostics: requireRuntimeModule('runtime.textOrchestratorDiagnostics'),
    };
    const shared = Object.assign({}, constants, baseUtils, recordUtils, eligibilityUtils, serviceUtils);

    function resolveDiagnosticsPolicy(globalScopeRef, settings) {
        const policy = globalScopeRef && globalScopeRef.LiveTranslatorDiagnosticsPolicy;
        function fallbackSnapshotPolicy(optionsArg = {}) {
            const guiState = globalScopeRef && globalScopeRef.LiveTranslatorGuiState;
            const surface = !guiState || typeof guiState !== 'object'
                ? true
                : guiState.translatorOpen === true;
            const diagnostics = settings && settings.diagnostics && typeof settings.diagnostics === 'object'
                ? settings.diagnostics
                : null;
            const performanceMode = diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'performanceMode')
                ? diagnostics.performanceMode === true
                : false;
            return {
                surface,
                detailView: surface
                    && !performanceMode
                    && optionsArg.detailView !== false
                    && optionsArg.includeDetails !== false,
                performanceMode,
            };
        }
        const getSnapshotPolicy = policy && typeof policy.getSnapshotPolicy === 'function'
            ? (optionsArg = {}) => policy.getSnapshotPolicy(Object.assign({
                globalScope: globalScopeRef,
                settings,
            }, optionsArg || {}))
            : fallbackSnapshotPolicy;
        return {
            getSnapshotPolicy,
            isSurfaceEnabled: () => getSnapshotPolicy().surface === true,
            isDetailViewEnabled: () => getSnapshotPolicy().detailView === true,
        };
    }

    function createTextOrchestrator(options = {}) {
        const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
        const orchestratorSettings = settings.textOrchestrator && typeof settings.textOrchestrator === 'object'
            ? settings.textOrchestrator
            : {};
        const diagnosticsPolicy = resolveDiagnosticsPolicy(globalScope, settings);
        const scope = Object.assign({}, shared, {
            globalScope,
            settings,
            orchestratorSettings,
            diagnosticsPolicy,
            getDiagnosticsSnapshotPolicy: diagnosticsPolicy.getSnapshotPolicy,
            isDiagnosticSurfaceEnabled: diagnosticsPolicy.isSurfaceEnabled,
            isDiagnosticDetailViewEnabled: diagnosticsPolicy.isDetailViewEnabled,
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
            detailDiagnosticsActive: false,
        });

        const methodControllers = {
            normalizeLifecycleIntent: 'policy',
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
            recordRenderAccepted: 'render',
            recordRenderDeferred: 'render',
            recordRenderRejected: 'render',
            recordRenderCommandDecision: 'render',
            rejectOpenRenderCommands: 'render',
            findRenderCommand: 'render',
            normalizeRenderCommandStatus: 'render',
            normalizeRenderCommandDecision: 'render',
            updateRenderCommandStatus: 'render',
            upsertItem: 'items',
            createEmptyItem: 'items',
            clearItemTranslationRequest: 'items',
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
            getSnapshot: 'diagnostics',
            publishNow: 'diagnostics',
            clearDiagnostics: 'diagnostics',
            schedulePublish: 'diagnostics',
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
        Object.keys(methodControllers).forEach((methodName) => {
            scope[methodName] = (...args) => callController(methodName, ...args);
        });

        const diagnosticsApi = Object.freeze({
            getSnapshot: scope.getSnapshot,
            snapshot: scope.getSnapshot,
            publish: scope.publishNow,
            clearDiagnostics: scope.clearDiagnostics,
        });
        const api = Object.freeze({
            setTranslationService: scope.setTranslationService,
            observeRecord: scope.observeRecord,
            updateItem: scope.updateItem,
            retireItem: scope.retireItem,
            requestItemTranslation: scope.requestItemTranslation,
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
            recordRenderAccepted: scope.recordRenderAccepted,
            recordRenderDeferred: scope.recordRenderDeferred,
            recordRenderRejected: scope.recordRenderRejected,
            subscribeSurfaceDraws: scope.subscribeSurfaceDraws,
            setItemPriority: scope.setItemPriority,
            setItemVisibility: scope.setItemVisibility,
            backgroundItem: scope.backgroundItem,
            queueRenderCommand: scope.queueRenderCommand,
            recordDecision: scope.recordDecision,
            recordTranslationEvent: scope.recordTranslationEvent,
            subscribe: scope.subscribe,
            getSnapshot: scope.getSnapshot,
            snapshot: scope.getSnapshot,
            publish: scope.publishNow,
            clearDiagnostics: scope.clearDiagnostics,
        });

        try { globalScope.LiveTranslatorTextOrchestrator = diagnosticsApi; } catch (_) {}
        scope.publishNow();
        if (scope.logger && typeof scope.logger.debug === 'function') {
            scope.logger.debug('[TextOrchestrator] Text orchestrator initialized.');
        }
        return api;
    }

    defineRuntimeModule('runtime.textOrchestrator', {
        createTextOrchestrator,
    });
})();
