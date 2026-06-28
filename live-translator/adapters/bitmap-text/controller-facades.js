// Bitmap Text adapter support: explicit controller dependency facades.
// Child controllers use these facets instead of constructing ad hoc dispatchers.
(() => {
    'use strict';

    function createBitmapTextControllerFacades(context = {}) {
        const callController = context.callController;
        if (typeof callController !== 'function') {
            throw new Error('[BitmapText] controller facades require a controller dispatcher.');
        }

        return Object.freeze({
            install: bindControllerMethods(callController, [
                'install',
                'installOrchestratorSubscription',
                'registerBitmapCapabilities',
                'exposeAdapterApi',
                'installBitmapDrawWrappers',
                'installBitmapDrawWrapper',
                'installDeferredBitmapDrawWrapper',
                'handleBitmapDrawText',
            ]),
            drawCapture: bindControllerMethods(callController, [
                'beginBitmapTextDrawTransaction',
            ]),
            drawDiagnostics: bindControllerMethods(callController, [
                'beginBitmapDrawHookDiagnostics',
                'isBitmapDrawTraceEnabled',
                'recordBitmapDrawEnterIfEnabled',
                'recordBitmapDrawTransactionOutcome',
                'createBitmapNativeDrawInvoker',
                'finishBitmapDrawHookDiagnostics',
            ]),
            drawPolicy: bindControllerMethods(callController, [
                'createBitmapDrawRoutingDecision',
                'resolveInlineBitmapReplacement',
            ]),
            fallbackObserver: bindControllerMethods(callController, [
                'handleBitmapTextRuns',
            ]),
            fallbackRenderer: bindControllerMethods(callController, [
                'executeBitmapFallbackRender',
            ]),
            copiedTargets: bindControllerMethods(callController, [
                'registerCopiedBitmapTargetProvider',
                'materializeCopiedBitmapTargetsBeforeMutation',
                'redrawMaterializedCopiedBitmapTargetsAfterMutation',
                'invalidateCopiedBitmapTargetsForMutation',
                'materializeCopiedBitmapTargetRedraws',
                'redrawCopiedBitmapTargets',
            ]),
            mutationPolicy: bindControllerMethods(callController, [
                'shouldBypassMutation',
                'getMutationBypassReason',
            ]),
            mutationDiagnostics: bindControllerMethods(callController, [
                'recordMutationHookDecision',
                'recordNativeMutationAttribution',
                'classifyBitmapMutationSurface',
                'bucketBitmapPixels',
                'bucketBitmapDimensions',
                'bucketDimension',
                'sanitizePerfLabel',
            ]),
            mutationInterest: bindControllerMethods(callController, [
                'planBitmapMutationObservation',
                'hasMutationObserverInterest',
                'shouldHandleBitmapMutation',
                'hasBitmapStateMutationInterest',
                'hasPendingBitmapTextSource',
            ]),
            mutationDescriptor: bindControllerMethods(callController, [
                'describeMutation',
                'createMutationJournalInput',
                'createLedgerMutationInput',
                'createMutationDescriptorFromJournalContext',
            ]),
            mutationInvalidation: bindControllerMethods(callController, [
                'handleBitmapMutation',
                'invalidateEntriesInRect',
            ]),
            mutationJournal: bindControllerMethods(callController, [
                'beginBitmapMutationTransaction',
            ]),
            mutationNative: bindControllerMethods(callController, [
                'applyNativeBitmapMutation',
            ]),
            mutationParticipants: bindControllerMethods(callController, [
                'registerBitmapMutationParticipants',
            ]),
            fallbackRunRecords: bindControllerMethods(callController, [
                'flushFallbackRunRecords',
            ]),
            records: bindControllerMethods(callController, [
                'observeEntry',
                'requestEntryTranslation',
                'applyRenderCommand',
                'getRenderGeneration',
                'isRenderTargetCurrent',
                'handleRenderRejected',
                'restoreTranslatedEntryText',
                'markEntryTerminal',
                'isEntryActive',
                'getEntryStatus',
                'isEntryRequestActive',
                'isEntryCompleted',
                'findEntryBySourceRun',
                'getEntryObservationStatus',
                'retireEntry',
                'detachEntryForCopiedTargets',
                'rejectUnresolvedRenderCommandsForInvalidation',
                'getUnresolvedRenderCommandsForEntry',
                'shouldKeepRecordAfterRenderRejection',
                'isRenderApplicationFailure',
                'normalizeRenderRejectionReason',
            ]),
            mutations: bindControllerMethods(callController, [
                'installBitmapMutationHooks',
                'installBitmapMutationHook',
            ]),
            frameMarkers: bindControllerMethods(callController, [
                'installFrameFlushHooks',
                'hasActiveFrameFlushHooks',
                'ensureActiveFrameFlushHooks',
                'ensureRecordedDrawDelivery',
                'installFrameFlushHook',
                'hasHookInChain',
                'installSmallTextMarkers',
                'installSmallTextMarker',
                'installNormalCharacterMarker',
                'isSmallTextDrawActive',
                'isNormalCharacterDrawActive',
                'isSmallTextScratchBitmap',
            ]),
            replay: bindControllerMethods(callController, [
                'ensureBitmapState',
                'getBitmapState',
                'nextDrawOrder',
                'recordBitmapRenderOp',
                'recordNativeTextForReplay',
                'discardRenderOpsInRect',
                'withBitmapReplay',
                'collectReplayItems',
                'replayBitmapItems',
                'replayBitmapRenderOp',
                'replayBitmapEntry',
                'drawBitmapTextValue',
                'drawBitmapTextArgs',
                'calculateClearRect',
            ]),
            textUtils: bindControllerMethods(callController, [
                'estimateTextWidth',
                'computeFontSignature',
                'sanitizeVisibleText',
                'sanitizePerChar',
                'isStandaloneGlyphText',
                'sanitizeBitmapDrawText',
                'safePrepareText',
                'describeEntryEligibility',
                'normalizeBitmapDrawCallArgs',
                'createBitmapDrawContext',
                'isDrawCaptureTraceEnabled',
                'recordDrawTrace',
                'bitmapTraceDetails',
                'cloneTraceRect',
                'roundTraceNumber',
                'readBitmapOwner',
                'resolveBitmapWindowSurface',
                'hasDedicatedOwnerHook',
                'describeBitmapContentsOwnership',
                'deriveEntryRect',
                'rectFromDimensions',
                'isValidRect',
                'rectHasArea',
                'rectOrNull',
                'rectanglesOverlap',
                'normalizeCanvasTextAlign',
                'describeOwnerType',
                'logTextDetected',
                'updateItem',
                'safeCall',
                'isAdapterContractFailure',
                'warn',
                'stringify',
                'finiteNumber',
                'positiveNumber',
                'pruneArray',
                'errorMessage',
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

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.controllerFacades',
        factory() {
            return {
                create: createBitmapTextControllerFacades,
            };
        },
    });
})();
