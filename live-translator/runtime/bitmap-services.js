// Bitmap adapter capability service.
//
// Bitmap, window, and sprite adapters need to coordinate low-level bitmap
// replay, mutation, and frame-boundary coordination. This runtime service keeps
// those cross-adapter surfaces explicit and facet-scoped instead of publishing
// them as process globals. Ownership-specific runtime state lives in the
// smaller bitmap/* modules; this file composes them into adapter facets.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmapServices',
        requires: {
            operationDiagnostics: 'runtime.operationDiagnostics',
            surfaceLedgerModule: 'runtime.bitmap.surfaceLedger',
            surfaceLedgerBoundaryModule: 'runtime.bitmap.surfaceLedgerBoundary',
            copyProjectionServicesModule: 'runtime.bitmap.copyProjectionServices',
            hookCaptureModule: 'runtime.bitmap.hookCapture',
            adapterCoordinationModule: 'runtime.bitmap.adapterCoordination',
            mutationJournalModule: 'runtime.bitmap.mutationJournal',
            defaultMutationParticipantsModule: 'runtime.bitmap.defaultMutationParticipants',
            inlineReplacementIndexModule: 'runtime.bitmap.inlineReplacementIndex',
            bitmapDirtyMarkerModule: 'runtime.bitmap.bitmapDirtyMarker',
            replayProviderRegistryModule: 'runtime.bitmap.replayProviderRegistry',
            renderGuardStateModule: 'runtime.bitmap.renderGuardState',
            mutationInterestRegistryModule: 'runtime.bitmap.mutationInterestRegistry',
            drawUnitPipelineModule: 'runtime.bitmap.drawUnitPipeline',
            serviceFacetsModule: 'runtime.bitmap.serviceFacets',
            bitmapRunAssembler: 'runtime.bitmap.runAssembler',
        },
        factory({ operationDiagnostics, surfaceLedgerModule, surfaceLedgerBoundaryModule, copyProjectionServicesModule, hookCaptureModule, adapterCoordinationModule, mutationJournalModule, defaultMutationParticipantsModule, inlineReplacementIndexModule, bitmapDirtyMarkerModule, replayProviderRegistryModule, renderGuardStateModule, mutationInterestRegistryModule, drawUnitPipelineModule, serviceFacetsModule, bitmapRunAssembler }) {

            function createBitmapServices(options = {}) {
                const logger = options.logger || console;
                const reportServiceError = operationDiagnostics.createOperationErrorReporter({
                    component: 'BitmapServices',
                    operationLabel: 'Bitmap service',
                    metricBase: 'bitmapServices.error',
                    domain: 'bitmap',
                    perf: options.perf || null,
                    logger,
                });
                const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
                const bitmapDirtyMarker = bitmapDirtyMarkerModule.createBitmapDirtyMarker({
                    reportError(operation, error, details) {
                        reportServiceError(operation, error, details);
                    },
                });
                const replayProviderRegistry = replayProviderRegistryModule.createReplayProviderRegistry({
                    reportError(operation, error, details) {
                        reportServiceError(operation, error, details);
                    },
                    warn,
                });
                const surfaceLedger = surfaceLedgerModule.createSurfaceLedger(settings.bitmapSurfaceLedger || {});
                const inlineReplacementIndex = inlineReplacementIndexModule.createInlineReplacementIndex();
                const hookCapture = hookCaptureModule.createHookCapture({ surfaceLedger });
                const surfaceLedgerBoundary = surfaceLedgerBoundaryModule.createSurfaceLedgerBoundary({
                    surfaceLedger,
                    hookCapture,
                    reportError(operation, error, details) {
                        reportServiceError(operation, error, details);
                    },
                });
                const recordLedgerCommittedDraw = surfaceLedgerBoundary.recordCommittedDraw;
                const ensureSurfaceLedgerMutationTransaction = surfaceLedgerBoundary.ensureMutationTransaction;
                const commitSurfaceLedgerMutation = surfaceLedgerBoundary.commitMutation;
                const abortSurfaceLedgerMutation = surfaceLedgerBoundary.abortMutation;
                const recordSurfaceLedgerCopyEdge = surfaceLedgerBoundary.recordCopyEdge;
                const getSurfaceLedgerSnapshot = surfaceLedgerBoundary.getSurfaceSnapshot;
                const getSurfaceLedgerIdentity = surfaceLedgerBoundary.getSurfaceIdentity;
                const ensureSurfaceLedgerRecord = surfaceLedgerBoundary.ensureSurfaceRecord;
                const getSurfaceById = surfaceLedgerBoundary.getSurfaceById;
                const hasSurfaceLedgerRecord = surfaceLedgerBoundary.hasSurfaceRecord;
                const getSurfaceTextRuns = surfaceLedgerBoundary.getTextRuns;
                const hasCurrentCopyEdgesTo = surfaceLedgerBoundary.hasCurrentCopyEdgesTo;
                const getInvalidatedCopyEdgesTo = surfaceLedgerBoundary.getInvalidatedCopyEdgesTo;
                const getDamagedCopyEdgesTo = surfaceLedgerBoundary.getDamagedCopyEdgesTo;
                const getProjectionState = surfaceLedgerBoundary.getProjectionState;
                const getProjectionStatesForTarget = surfaceLedgerBoundary.getProjectionStatesForTarget;
                const getRecoverableProjectionStatesForTarget = surfaceLedgerBoundary.getRecoverableProjectionStatesForTarget;
                const adapterCoordination = adapterCoordinationModule.createAdapterCoordination({
                    reportError: (operation, error) => reportServiceError(operation, error),
                });
                const mutationJournal = mutationJournalModule.createMutationJournal({
                    reportError: (operation, error) => reportServiceError(operation, error),
                });
                const captureBitmapDrawState = typeof options.captureBitmapDrawState === 'function'
                    ? options.captureBitmapDrawState
                    : captureDefaultBitmapDrawState;
                const maxDrawUnitsPerBitmap = readPositiveInteger(
                    settings.pendingDrawUnits && settings.pendingDrawUnits.maxUnitsPerBitmap,
                    8192
                );

                function warn(message, error) {
                    if (!logger || typeof logger.warn !== 'function') return;
                    try { logger.warn(message, error); } catch (_) {}
                }

                const markBitmapPixelsDirty = bitmapDirtyMarker.markBitmapPixelsDirty;
                const registerReplayProvider = replayProviderRegistry.registerReplayProvider;
                const hasReplayProvider = replayProviderRegistry.hasReplayProvider;
                const callReplayProvider = replayProviderRegistry.callReplayProvider;
                const mutationInterestRegistry = mutationInterestRegistryModule.createMutationInterestRegistry({
                    reportError(operation, error, details) {
                        reportServiceError(operation, error, details);
                    },
                    warn,
                });
                const registerMutationPublisher = mutationInterestRegistry.registerMutationPublisher;
                const hasMutationPublisher = mutationInterestRegistry.hasMutationPublisher;
                const watchBitmap = mutationInterestRegistry.watchBitmap;
                const registerMutationInterestProvider = mutationInterestRegistry.registerMutationInterestProvider;
                const hasMutationInterest = mutationInterestRegistry.hasMutationInterest;
                const collectMutationCapabilities = mutationInterestRegistry.collectMutationCapabilities;
                const publishMutation = mutationInterestRegistry.publishMutation;
                const drawUnitPipeline = drawUnitPipelineModule.createDrawUnitPipeline({
                    runAssembler: bitmapRunAssembler,
                    captureBitmapDrawState,
                    maxDrawUnitsPerBitmap,
                    recordCommittedDraw(bitmap, input, unit) {
                        return recordLedgerCommittedDraw(bitmap, input, unit);
                    },
                    reportError(operation, error, details) {
                        reportServiceError(operation, error, details);
                    },
                    warn,
                });
                const recordDraw = drawUnitPipeline.recordDraw;
                const enterDrawRunContext = drawUnitPipeline.enterDrawRunContext;
                const getActiveDrawRunContext = drawUnitPipeline.getActiveDrawRunContext;
                const subscribeTextRuns = drawUnitPipeline.subscribeTextRuns;
                const flushPendingDrawUnits = drawUnitPipeline.flushPendingDrawUnits;
                const flushOwnerDrawUnits = drawUnitPipeline.flushOwnerDrawUnits;
                const hasPendingDrawUnits = drawUnitPipeline.hasPendingDrawUnits;
                const getTerminalDrawUnitEvents = drawUnitPipeline.getTerminalDrawUnitEvents;
                const clearTerminalDrawUnitEvents = drawUnitPipeline.clearTerminalDrawUnitEvents;
                const getDrawUnitDrainEvents = drawUnitPipeline.getDrawUnitDrainEvents;
                const clearDrawUnitDrainEvents = drawUnitPipeline.clearDrawUnitDrainEvents;
                const renderGuardState = renderGuardStateModule.createRenderGuardStateManager({
                    onPendingDrawUnitFlushReady(bitmap, reason) {
                        flushPendingDrawUnits(reason, bitmap, {
                            phase: 'guard-exit',
                            source: 'pending-draw-unit-deferral',
                        });
                    },
                });
                const getRenderGuardState = renderGuardState.getRenderGuardState;
                const getRenderGuardReason = renderGuardState.getRenderGuardReason;
                const getSourceObservationPolicy = renderGuardState.getSourceObservationPolicy;
                const withBitmapReplayGuard = renderGuardState.withBitmapReplayGuard;
                const withBitmapSkipGuard = renderGuardState.withBitmapSkipGuard;
                const withSpriteTextReplayGuard = renderGuardState.withSpriteTextReplayGuard;
                const withBitmapSkipAndSpriteReplayGuard = renderGuardState.withBitmapSkipAndSpriteReplayGuard;
                const withWindowDrawTextExReplayGuard = renderGuardState.withWindowDrawTextExReplayGuard;
                const enterWindowPipelineGuard = renderGuardState.enterWindowPipelineGuard;
                const withWindowPipelineGuard = renderGuardState.withWindowPipelineGuard;
                const enterPendingDrawUnitFlushDeferral = renderGuardState.enterPendingDrawUnitFlushDeferral;
                const withPendingDrawUnitFlushDeferral = renderGuardState.withPendingDrawUnitFlushDeferral;
                const withBitmapNativeDrawAttribution = renderGuardState.withBitmapNativeDrawAttribution;
                const withActiveRedrawEntry = renderGuardState.withActiveRedrawEntry;
                const getActiveRedrawEntry = renderGuardState.getActiveRedrawEntry;

                const copyProjectionServices = copyProjectionServicesModule.createCopyProjectionServices({
                    settings,
                    surfaceLedgerBoundary,
                    replay: {
                        withBitmapReplayGuard,
                        replayBitmapItems(targetBitmap, items) {
                            return callReplayProvider('replayBitmapItems', false, [targetBitmap, items]);
                        },
                    },
                    dirty: {
                        markBitmapPixelsDirty,
                    },
                    reportError(operation, error, details) {
                        reportServiceError(operation, error, details);
                    },
                    warn,
                });
                const registerCopiedTargetProvider = copyProjectionServices.registerCopiedTargetProvider;
                const collectCopiedTargetRestoreSeeds = copyProjectionServices.collectCopiedTargetRestoreSeeds;
                const redrawCopiedTargetRestoreComposition = copyProjectionServices.redrawCopiedTargetRestoreComposition;
                const recordCopiedTextTargetPayload = copyProjectionServices.recordCopiedTextTargetPayload;
                const getCopiedTextTargetMaterializations = copyProjectionServices.getCopiedTextTargetMaterializations;
                const getPendingCopiedTextTargetMaterializations = copyProjectionServices.getPendingCopiedTextTargetMaterializations;
                const getProjectedTextRunsForTarget = copyProjectionServices.getProjectedTextRunsForTarget;
                const resolveRecoverableProjectedRuns = copyProjectionServices.resolveRecoverableProjectedRuns;
                defaultMutationParticipantsModule.registerDefaultMutationParticipants({
                    mutationJournal,
                    flushPendingDrawUnits,
                    ensureSurfaceLedgerMutationTransaction,
                    commitSurfaceLedgerMutation,
                    abortSurfaceLedgerMutation,
                    recordSurfaceLedgerCopyEdge,
                    captureCopiedTargetRestoreMaterial(context) {
                        return copyProjectionServices.captureCopiedTargetRestoreMaterial(context);
                    },
                    publishMutation,
                    reportError(operation, error, details) {
                        reportServiceError(operation, error, details);
                    },
                });

                function registerFrameFlushProvider(provider) {
                    return adapterCoordination.registerFrameFlushProvider(provider);
                }

                function ensureFrameFlushProvider(adapterId, input = {}) {
                    return adapterCoordination.ensureFrameFlushProvider(adapterId, input);
                }

                function registerSurfaceClassifier(provider) {
                    return adapterCoordination.registerSurfaceClassifier(provider);
                }

                function describeSurface(bitmap, input = {}) {
                    return adapterCoordination.describeSurface(bitmap, input);
                }

                function beginTextDrawCapture(bitmap, input = {}) {
                    try {
                        return hookCapture.beginTextDraw(bitmap, input);
                    } catch (error) {
                        reportServiceError('hookCapture.beginTextDraw', error);
                        return null;
                    }
                }

                function registerMutationParticipant(participant) {
                    try {
                        return mutationJournal.registerParticipant(participant);
                    } catch (error) {
                        reportServiceError('mutationJournal.registerParticipant', error);
                        return () => {};
                    }
                }

                function beginMutationJournal(bitmap, input = {}) {
                    try {
                        return mutationJournal.beginMutation(bitmap, input);
                    } catch (error) {
                        reportServiceError('mutationJournal.beginMutation', error);
                        return null;
                    }
                }

                function rememberInlineReplacement(input = {}) {
                    try {
                        return inlineReplacementIndex.remember(input);
                    } catch (error) {
                        reportServiceError('inlineReplacement.remember', error);
                        return null;
                    }
                }

                function lookupInlineReplacement(input = {}) {
                    try {
                        return inlineReplacementIndex.lookup(input);
                    } catch (error) {
                        reportServiceError('inlineReplacement.lookup', error);
                        return null;
                    }
                }

                function forgetInlineReplacement(input = {}) {
                    try {
                        return inlineReplacementIndex.forget(input);
                    } catch (error) {
                        reportServiceError('inlineReplacement.forget', error);
                        return 0;
                    }
                }

                return serviceFacetsModule.createBitmapServiceFacets({
                    replay: {
                        registerReplayProvider,
                        hasReplayProvider,
                        callReplayProvider,
                        withBitmapReplay(bitmap, callback, source) {
                            return replayProviderRegistry.withBitmapReplay(bitmap, callback, source);
                        },
                    },
                    copiedTargets: {
                        registerCopiedTargetProvider,
                        collectCopiedTargetRestoreSeeds,
                        redrawCopiedTargetRestoreComposition,
                        recordCopiedTextTargetPayload,
                        getCopiedTextTargetMaterializations,
                        getPendingCopiedTextTargetMaterializations,
                        getProjectedTextRunsForTarget,
                        resolveRecoverableProjectedRuns,
                    },
                    mutation: {
                        registerMutationPublisher,
                        hasMutationPublisher,
                        watchBitmap,
                        registerMutationInterestProvider,
                        publishMutation,
                        hasMutationInterest,
                        collectMutationCapabilities,
                        registerMutationParticipant,
                        beginMutationJournal,
                    },
                    coordination: {
                        registerFrameFlushProvider,
                        ensureFrameFlushProvider,
                        registerSurfaceClassifier,
                        describeSurface,
                    },
                    renderGuards: {
                        getRenderGuardState,
                        getRenderGuardReason,
                        getSourceObservationPolicy,
                        withBitmapReplayGuard,
                        withBitmapSkipGuard,
                        withSpriteTextReplayGuard,
                        withBitmapSkipAndSpriteReplayGuard,
                        withWindowDrawTextExReplayGuard,
                        enterWindowPipelineGuard,
                        withWindowPipelineGuard,
                        enterPendingDrawUnitFlushDeferral,
                        withPendingDrawUnitFlushDeferral,
                        withBitmapNativeDrawAttribution,
                        withActiveRedrawEntry,
                        getActiveRedrawEntry,
                    },
                    drawCapture: {
                        beginTextDrawCapture,
                    },
                    inlineReplacement: {
                        rememberInlineReplacement,
                        lookupInlineReplacement,
                        forgetInlineReplacement,
                    },
                    drawUnits: {
                        recordDraw,
                        enterDrawRunContext,
                        getActiveDrawRunContext,
                        subscribeTextRuns,
                        flushPendingDrawUnits,
                        flushOwnerDrawUnits,
                        hasPendingDrawUnits,
                        getTerminalDrawUnitEvents,
                        clearTerminalDrawUnitEvents,
                        getDrawUnitDrainEvents,
                        clearDrawUnitDrainEvents,
                    },
                    surfaceLedger: {
                        hasSurfaceLedgerRecord,
                        ensureSurfaceLedgerRecord,
                        getSurfaceLedgerIdentity,
                        getSurfaceById,
                        hasCurrentCopyEdgesTo,
                        getInvalidatedCopyEdgesTo,
                        getDamagedCopyEdgesTo,
                        getSurfaceLedgerSnapshot,
                        getSurfaceTextRuns,
                        getProjectionState,
                        getProjectionStatesForTarget,
                        getRecoverableProjectionStatesForTarget,
                    },
                    dirty: {
                        markBitmapPixelsDirty,
                    },
                });
            }

            function captureDefaultBitmapDrawState(bitmap) {
                if (!bitmap) return null;
                return {
                    fontFace: bitmap.fontFace,
                    fontSize: bitmap.fontSize,
                    fontBold: bitmap.fontBold,
                    fontItalic: bitmap.fontItalic,
                    textColor: bitmap.textColor,
                    outlineColor: bitmap.outlineColor,
                    outlineWidth: bitmap.outlineWidth,
                };
            }

            function readPositiveInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
            }

            return {
                createBitmapServices,
            };
        },
    });
})();
