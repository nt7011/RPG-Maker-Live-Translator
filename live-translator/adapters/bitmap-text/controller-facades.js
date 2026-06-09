// Bitmap Text adapter support: explicit controller dependency facades.
// Child controllers use these facets instead of constructing ad hoc dispatchers.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/controller-facades.js.');
    }

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
                'shouldBypassBitmapDraw',
                'describeBitmapDrawBypassReason',
                'recordBitmapSurfaceDraw',
                'createFragment',
                'handleBitmapDrawBatch',
            ]),
            aggregation: bindControllerMethods(callController, [
                'scheduleFlush',
                'scheduleFallbackFlush',
                'flushQueuedBitmaps',
                'flushAggregatedLines',
                'takeFragmentsForFlush',
                'finalizeFragmentOwnership',
                'releaseFragmentOwnership',
                'groupFragmentsIntoLines',
                'canMergeFragments',
                'createEntryFromGroup',
                'registerBitmapEntry',
                'refreshExistingEntry',
            ]),
            records: bindControllerMethods(callController, [
                'observeEntry',
                'requestEntryTranslation',
                'applyRenderCommand',
                'getRenderGeneration',
                'isRenderTargetCurrent',
                'handleRenderRejected',
                'restoreTranslatedEntryText',
                'redrawBitmapEntry',
                'markEntryTerminal',
                'isEntryActive',
                'getEntryStatus',
                'isEntryRequestActive',
                'isEntryCompleted',
                'getEntryObservationStatus',
                'retireEntry',
                'shouldKeepRecordAfterRenderRejection',
                'isRenderApplicationFailure',
                'normalizeRenderRejectionReason',
            ]),
            mutations: bindControllerMethods(callController, [
                'installBitmapMutationHooks',
                'installBitmapMutationHook',
                'shouldBypassMutation',
                'getMutationBypassReason',
                'hasMutationObserverInterest',
                'shouldHandleBitmapMutation',
                'hasBitmapStateMutationInterest',
                'hasWindowEntryMutationInterest',
                'hasAnyWindowEntries',
                'recordNativeMutationAttribution',
                'classifyBitmapMutationSurface',
                'bucketBitmapPixels',
                'bucketBitmapDimensions',
                'bucketDimension',
                'sanitizePerfLabel',
                'describeMutation',
                'handleBitmapMutation',
                'flushFragmentsBeforeMutation',
                'invalidateEntriesInRect',
                'discardFragmentsInRect',
                'invalidateWindowEntries',
                'wasWindowEntryObservedInCurrentRefresh',
                'isWindowRefreshMutation',
            ]),
            frameMarkers: bindControllerMethods(callController, [
                'installFrameFlushHooks',
                'hasActiveFrameFlushHooks',
                'ensureActiveFrameFlushHooks',
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
                'isDrawCaptureTraceEnabled',
                'recordDrawTrace',
                'bitmapTraceDetails',
                'cloneTraceRect',
                'roundTraceNumber',
                'readBitmapOwner',
                'resolveBitmapWindowSurface',
                'hasDedicatedOwnerHook',
                'describeBitmapContentsOwnership',
                'windowEntryBelongsToBitmap',
                'deriveWindowEntryRect',
                'deriveEntryRect',
                'fragmentRect',
                'rectFromDimensions',
                'isValidRect',
                'rectHasArea',
                'rectOrNull',
                'rectanglesOverlap',
                'normalizeCanvasTextAlign',
                'describeOwnerType',
                'shouldKeepWindowEntryTranslation',
                'getWindowOwnerScreenState',
                'retireWindowEntry',
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

    defineRuntimeModule('adapters.bitmapText.controllerFacades', {
        create: createBitmapTextControllerFacades,
    });
})();
