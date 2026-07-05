// Bitmap service adapter facets.
//
// Bitmap services compose shared runtime state. This module owns the adapter
// API projections so each adapter receives only the capability surface it is
// allowed to use.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.serviceFacets',
        factory() {
            function createBitmapServiceFacets(deps = {}) {
                const input = deps && typeof deps === 'object' ? deps : {};
                const replay = requireNamespace(input.replay, 'replay', [
                    'registerReplayProvider',
                    'hasReplayProvider',
                    'callReplayProvider',
                    'withBitmapReplay',
                ]);
                const copiedTargets = requireNamespace(input.copiedTargets, 'copiedTargets', [
                    'registerCopiedTargetProvider',
                    'collectCopiedTargetRestoreSeeds',
                    'redrawCopiedTargetRestoreComposition',
                    'recordCopiedTextTargetPayload',
                    'getCopiedTextTargetMaterializations',
                    'getPendingCopiedTextTargetMaterializations',
                    'getProjectedTextRunsForTarget',
                    'resolveRecoverableProjectedRuns',
                ]);
                const mutation = requireNamespace(input.mutation, 'mutation', [
                    'registerMutationPublisher',
                    'hasMutationPublisher',
                    'watchBitmap',
                    'registerMutationInterestProvider',
                    'publishMutation',
                    'hasMutationInterest',
                    'collectMutationCapabilities',
                    'registerMutationParticipant',
                    'beginMutationJournal',
                ]);
                const coordination = requireNamespace(input.coordination, 'coordination', [
                    'registerFrameFlushProvider',
                    'ensureFrameFlushProvider',
                    'registerSurfaceClassifier',
                    'describeSurface',
                ]);
                const renderGuards = requireNamespace(input.renderGuards, 'renderGuards', [
                    'getRenderGuardState',
                    'getRenderGuardReason',
                    'getSourceObservationPolicy',
                    'withBitmapReplayGuard',
                    'withBitmapSkipGuard',
                    'withSpriteTextReplayGuard',
                    'withBitmapSkipAndSpriteReplayGuard',
                    'withWindowDrawTextExReplayGuard',
                    'enterWindowPipelineGuard',
                    'withWindowPipelineGuard',
                    'enterPendingDrawUnitFlushDeferral',
                    'withPendingDrawUnitFlushDeferral',
                    'withBitmapNativeDrawAttribution',
                    'withActiveRedrawEntry',
                    'getActiveRedrawEntry',
                ]);
                const drawCapture = requireNamespace(input.drawCapture, 'drawCapture', [
                    'beginTextDrawCapture',
                ]);
                const inlineReplacement = requireNamespace(input.inlineReplacement, 'inlineReplacement', [
                    'rememberInlineReplacement',
                    'lookupInlineReplacement',
                    'forgetInlineReplacement',
                ]);
                const drawUnits = requireNamespace(input.drawUnits, 'drawUnits', [
                    'recordDraw',
                    'enterDrawRunContext',
                    'getActiveDrawRunContext',
                    'subscribeTextRuns',
                    'flushPendingDrawUnits',
                    'flushOwnerDrawUnits',
                    'hasPendingDrawUnits',
                    'getTerminalDrawUnitEvents',
                    'clearTerminalDrawUnitEvents',
                    'getDrawUnitDrainEvents',
                    'clearDrawUnitDrainEvents',
                ]);
                const surfaceLedger = requireNamespace(input.surfaceLedger, 'surfaceLedger', [
                    'hasSurfaceLedgerRecord',
                    'ensureSurfaceLedgerRecord',
                    'getSurfaceLedgerIdentity',
                    'getSurfaceById',
                    'hasCurrentCopyEdgesTo',
                    'getInvalidatedCopyEdgesTo',
                    'getDamagedCopyEdgesTo',
                    'getSurfaceLedgerSnapshot',
                    'getSurfaceTextRuns',
                    'getProjectionState',
                    'getProjectionStatesForTarget',
                ]);
                const dirty = requireNamespace(input.dirty, 'dirty', [
                    'markBitmapPixelsDirty',
                ]);

                const bitmapFacet = freezeApi({
                    registerReplayProvider: replay.registerReplayProvider,
                    registerCopiedTargetProvider: copiedTargets.registerCopiedTargetProvider,
                    collectCopiedTargetRestoreSeeds: copiedTargets.collectCopiedTargetRestoreSeeds,
                    redrawCopiedTargetRestoreComposition: copiedTargets.redrawCopiedTargetRestoreComposition,
                    recordCopiedTextTargetPayload: copiedTargets.recordCopiedTextTargetPayload,
                    registerMutationPublisher: mutation.registerMutationPublisher,
                    registerMutationInterestProvider: mutation.registerMutationInterestProvider,
                    publishMutation: mutation.publishMutation,
                    hasMutationInterest: mutation.hasMutationInterest,
                    collectMutationCapabilities: mutation.collectMutationCapabilities,
                    ensureFrameFlushProvider: coordination.ensureFrameFlushProvider,
                    describeSurface: coordination.describeSurface,
                    getRenderGuardState: renderGuards.getRenderGuardState,
                    getRenderGuardReason: renderGuards.getRenderGuardReason,
                    getSourceObservationPolicy: renderGuards.getSourceObservationPolicy,
                    withBitmapReplayGuard: renderGuards.withBitmapReplayGuard,
                    withBitmapSkipGuard: renderGuards.withBitmapSkipGuard,
                    withSpriteTextReplayGuard: renderGuards.withSpriteTextReplayGuard,
                    withBitmapSkipAndSpriteReplayGuard: renderGuards.withBitmapSkipAndSpriteReplayGuard,
                    enterWindowPipelineGuard: renderGuards.enterWindowPipelineGuard,
                    withWindowPipelineGuard: renderGuards.withWindowPipelineGuard,
                    withBitmapNativeDrawAttribution: renderGuards.withBitmapNativeDrawAttribution,
                    withActiveRedrawEntry: renderGuards.withActiveRedrawEntry,
                    getActiveRedrawEntry: renderGuards.getActiveRedrawEntry,
                    enterDrawRunContext: drawUnits.enterDrawRunContext,
                    getActiveDrawRunContext: drawUnits.getActiveDrawRunContext,
                    beginTextDrawCapture: drawCapture.beginTextDrawCapture,
                    beginMutationJournal: mutation.beginMutationJournal,
                    registerMutationParticipant: mutation.registerMutationParticipant,
                    rememberInlineReplacement: inlineReplacement.rememberInlineReplacement,
                    lookupInlineReplacement: inlineReplacement.lookupInlineReplacement,
                    forgetInlineReplacement: inlineReplacement.forgetInlineReplacement,
                    recordDraw: drawUnits.recordDraw,
                    markBitmapPixelsDirty: dirty.markBitmapPixelsDirty,
                    hasSurfaceLedgerRecord: surfaceLedger.hasSurfaceLedgerRecord,
                    ensureSurfaceLedgerRecord: surfaceLedger.ensureSurfaceLedgerRecord,
                    getSurfaceLedgerIdentity: surfaceLedger.getSurfaceLedgerIdentity,
                    getSurfaceById: surfaceLedger.getSurfaceById,
                    hasCurrentCopyEdgesTo: surfaceLedger.hasCurrentCopyEdgesTo,
                    getInvalidatedCopyEdgesTo: surfaceLedger.getInvalidatedCopyEdgesTo,
                    getDamagedCopyEdgesTo: surfaceLedger.getDamagedCopyEdgesTo,
                    getCopiedTextTargetMaterializations: copiedTargets.getCopiedTextTargetMaterializations,
                    getPendingCopiedTextTargetMaterializations: copiedTargets.getPendingCopiedTextTargetMaterializations,
                    getProjectedTextRunsForTarget: copiedTargets.getProjectedTextRunsForTarget,
                    subscribeTextRuns: drawUnits.subscribeTextRuns,
                    flushPendingDrawUnits: drawUnits.flushPendingDrawUnits,
                    flushOwnerDrawUnits: drawUnits.flushOwnerDrawUnits,
                    hasPendingDrawUnits: drawUnits.hasPendingDrawUnits,
                });

                const windowReplayFacet = freezeApi({
                    hasProvider: replay.hasReplayProvider,
                    ensureBitmapState(bitmap) {
                        return replay.callReplayProvider('ensureBitmapState', null, [bitmap]);
                    },
                    nextDrawOrder(state) {
                        return replay.callReplayProvider('nextDrawOrder', 0, [state]);
                    },
                    collectReplayItems(state, rect, currentEntry, relation) {
                        const items = replay.callReplayProvider('collectReplayItems', [], [state, rect, currentEntry, relation]);
                        return Array.isArray(items) ? items : [];
                    },
                    replayBitmapItems(bitmap, items) {
                        return replay.callReplayProvider('replayBitmapItems', false, [bitmap, items]);
                    },
                    withBitmapReplay: replay.withBitmapReplay,
                    getRenderGuardState: renderGuards.getRenderGuardState,
                    getRenderGuardReason: renderGuards.getRenderGuardReason,
                    getSourceObservationPolicy: renderGuards.getSourceObservationPolicy,
                    withBitmapSkipGuard: renderGuards.withBitmapSkipGuard,
                    withSpriteTextReplayGuard: renderGuards.withSpriteTextReplayGuard,
                    withBitmapSkipAndSpriteReplayGuard: renderGuards.withBitmapSkipAndSpriteReplayGuard,
                    withWindowDrawTextExReplayGuard: renderGuards.withWindowDrawTextExReplayGuard,
                    enterWindowPipelineGuard: renderGuards.enterWindowPipelineGuard,
                    withWindowPipelineGuard: renderGuards.withWindowPipelineGuard,
                    enterPendingDrawUnitFlushDeferral: renderGuards.enterPendingDrawUnitFlushDeferral,
                    withPendingDrawUnitFlushDeferral: renderGuards.withPendingDrawUnitFlushDeferral,
                    withBitmapNativeDrawAttribution: renderGuards.withBitmapNativeDrawAttribution,
                    rectFromDimensions(x, y, width, height) {
                        return replay.callReplayProvider('rectFromDimensions', null, [x, y, width, height]);
                    },
                    isValidRect(rect) {
                        return replay.callReplayProvider('isValidRect', false, [rect]) === true;
                    },
                    registerMutationParticipant: mutation.registerMutationParticipant,
                    registerMutationInterestProvider: mutation.registerMutationInterestProvider,
                    registerCopiedTargetProvider: copiedTargets.registerCopiedTargetProvider,
                    collectCopiedTargetRestoreSeeds: copiedTargets.collectCopiedTargetRestoreSeeds,
                    redrawCopiedTargetRestoreComposition: copiedTargets.redrawCopiedTargetRestoreComposition,
                    rememberInlineReplacement: inlineReplacement.rememberInlineReplacement,
                    lookupInlineReplacement: inlineReplacement.lookupInlineReplacement,
                    forgetInlineReplacement: inlineReplacement.forgetInlineReplacement,
                    markBitmapPixelsDirty: dirty.markBitmapPixelsDirty,
                    hasSurfaceLedgerRecord: surfaceLedger.hasSurfaceLedgerRecord,
                    getSurfaceLedgerIdentity: surfaceLedger.getSurfaceLedgerIdentity,
                    getSurfaceById: surfaceLedger.getSurfaceById,
                    hasCurrentCopyEdgesTo: surfaceLedger.hasCurrentCopyEdgesTo,
                    getInvalidatedCopyEdgesTo: surfaceLedger.getInvalidatedCopyEdgesTo,
                    getDamagedCopyEdgesTo: surfaceLedger.getDamagedCopyEdgesTo,
                    getCopiedTextTargetMaterializations: copiedTargets.getCopiedTextTargetMaterializations,
                    getPendingCopiedTextTargetMaterializations: copiedTargets.getPendingCopiedTextTargetMaterializations,
                    getProjectedTextRunsForTarget: copiedTargets.getProjectedTextRunsForTarget,
                    subscribeTextRuns: drawUnits.subscribeTextRuns,
                    flushPendingDrawUnits: drawUnits.flushPendingDrawUnits,
                    hasPendingDrawUnits: drawUnits.hasPendingDrawUnits,
                });

                const spriteFacet = freezeApi({
                    watchBitmap: mutation.watchBitmap,
                    hasMutationPublisher: mutation.hasMutationPublisher,
                    registerFrameFlushProvider: coordination.registerFrameFlushProvider,
                    registerSurfaceClassifier: coordination.registerSurfaceClassifier,
                    getRenderGuardState: renderGuards.getRenderGuardState,
                    getRenderGuardReason: renderGuards.getRenderGuardReason,
                    getSourceObservationPolicy: renderGuards.getSourceObservationPolicy,
                    withBitmapSkipGuard: renderGuards.withBitmapSkipGuard,
                    withSpriteTextReplayGuard: renderGuards.withSpriteTextReplayGuard,
                    withBitmapSkipAndSpriteReplayGuard: renderGuards.withBitmapSkipAndSpriteReplayGuard,
                    enterWindowPipelineGuard: renderGuards.enterWindowPipelineGuard,
                    withWindowPipelineGuard: renderGuards.withWindowPipelineGuard,
                    withBitmapNativeDrawAttribution: renderGuards.withBitmapNativeDrawAttribution,
                    markBitmapPixelsDirty: dirty.markBitmapPixelsDirty,
                    hasSurfaceLedgerRecord: surfaceLedger.hasSurfaceLedgerRecord,
                    getSurfaceLedgerIdentity: surfaceLedger.getSurfaceLedgerIdentity,
                    getSurfaceById: surfaceLedger.getSurfaceById,
                    hasCurrentCopyEdgesTo: surfaceLedger.hasCurrentCopyEdgesTo,
                    getInvalidatedCopyEdgesTo: surfaceLedger.getInvalidatedCopyEdgesTo,
                    getDamagedCopyEdgesTo: surfaceLedger.getDamagedCopyEdgesTo,
                    getCopiedTextTargetMaterializations: copiedTargets.getCopiedTextTargetMaterializations,
                    getPendingCopiedTextTargetMaterializations: copiedTargets.getPendingCopiedTextTargetMaterializations,
                    getProjectedTextRunsForTarget: copiedTargets.getProjectedTextRunsForTarget,
                    subscribeTextRuns: drawUnits.subscribeTextRuns,
                    flushPendingDrawUnits: drawUnits.flushPendingDrawUnits,
                    flushOwnerDrawUnits: drawUnits.flushOwnerDrawUnits,
                    hasPendingDrawUnits: drawUnits.hasPendingDrawUnits,
                });

                const intelFacet = freezeApi({
                    getSurfaceLedgerSnapshot: surfaceLedger.getSurfaceLedgerSnapshot,
                    getSurfaceTextRuns: surfaceLedger.getSurfaceTextRuns,
                    getProjectionState: surfaceLedger.getProjectionState,
                    getProjectionStatesForTarget: surfaceLedger.getProjectionStatesForTarget,
                    getProjectedTextRunsForTarget: copiedTargets.getProjectedTextRunsForTarget,
                    resolveRecoverableProjectedRuns: copiedTargets.resolveRecoverableProjectedRuns,
                    getTerminalDrawUnitEvents: drawUnits.getTerminalDrawUnitEvents,
                    clearTerminalDrawUnitEvents: drawUnits.clearTerminalDrawUnitEvents,
                    getDrawUnitDrainEvents: drawUnits.getDrawUnitDrainEvents,
                    clearDrawUnitDrainEvents: drawUnits.clearDrawUnitDrainEvents,
                });

                return freezeApi({
                    forBitmapAdapter() {
                        return bitmapFacet;
                    },
                    forWindowAdapter() {
                        return windowReplayFacet;
                    },
                    forSpriteAdapter() {
                        return spriteFacet;
                    },
                    forIntel() {
                        return intelFacet;
                    },
                });
            }

            function requireNamespace(value, name, methods) {
                const namespace = value && typeof value === 'object' ? value : null;
                if (!namespace) {
                    throw new Error(`[LiveTranslator] runtime.bitmap.serviceFacets requires ${name}.`);
                }
                methods.forEach((methodName) => {
                    if (typeof namespace[methodName] !== 'function') {
                        throw new Error(`[LiveTranslator] runtime.bitmap.serviceFacets requires ${name}.${methodName}.`);
                    }
                });
                return namespace;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createBitmapServiceFacets,
            });
        },
    });
})();
