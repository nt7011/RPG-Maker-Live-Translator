// Shared draw-boundary and render transaction primitives.
//
// Adapters still own engine-specific drawing. This module owns the common
// lifecycle language around source draws, admitted render commands, deferred
// work, committed pixels, render rejection, and no-op render outcomes.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.renderTransaction',
        requires: {
            copiedTargetProofSchema: 'runtime.copiedTargetProofSchema',
        },
        factory({ copiedTargetProofSchema }) {
            const PHASES = Object.freeze({
                SOURCE_DRAW_OBSERVED: 'source-draw-observed',
                SOURCE_DRAW_COMMITTED: 'source-draw-committed',
                TRANSLATION_KNOWN: 'translation-known',
                RENDER_ADMITTED: 'render-admitted',
                RENDER_DEFERRED: 'render-deferred',
                RENDER_COMMITTED: 'render-committed',
                RENDER_REJECTED: 'render-rejected',
                RENDER_NOOP: 'render-noop',
            });

            const PHASE_STATUS = Object.freeze({
                [PHASES.SOURCE_DRAW_OBSERVED]: 'pending',
                [PHASES.SOURCE_DRAW_COMMITTED]: 'complete',
                [PHASES.TRANSLATION_KNOWN]: 'ready',
                [PHASES.RENDER_ADMITTED]: 'admitted',
                [PHASES.RENDER_DEFERRED]: 'deferred',
                [PHASES.RENDER_COMMITTED]: 'committed',
                [PHASES.RENDER_REJECTED]: 'rejected',
                [PHASES.RENDER_NOOP]: 'noop',
            });

            const COMMIT_PHASE_BY_STATUS = Object.freeze({
                committed: PHASES.RENDER_COMMITTED,
                // Legacy input alias: remove after retained renderCommit payloads stop
                // using accepted to mean committed pixels.
                accepted: PHASES.RENDER_COMMITTED,
                deferred: PHASES.RENDER_DEFERRED,
                rejected: PHASES.RENDER_REJECTED,
                noop: PHASES.RENDER_NOOP,
            });

            const RENDER_COMMIT_KINDS = Object.freeze({
                NATIVE_SUBSTITUTION: 'native-substitution',
                ASYNC_REDRAW: 'async-redraw',
                BITMAP_REDRAW: 'bitmap-redraw',
                OVERLAY_REDRAW: 'overlay-redraw',
                REJECTED: 'rejected',
                NO_OP: 'no-op',
            });

            const RENDER_COMMIT_RESERVED_KEYS = Object.freeze({
                schemaVersion: true,
                status: true,
                phase: true,
                committed: true,
                // Legacy input key: keep reserved so old renderCommit payloads do not
                // leak an accepted field into diagnostic evidence.
                accepted: true,
                deferred: true,
                rejected: true,
                noop: true,
                terminal: true,
                kind: true,
                mode: true,
                route: true,
                reason: true,
                details: true,
                renderCommit: true,
                surfaceProof: true,
                copiedTargetProof: true,
                copiedTargetRenderPlan: true,
                adapterId: true,
                itemId: true,
                recordId: true,
                surfaceId: true,
                slotKey: true,
                strategy: true,
                commandId: true,
                commandGeneration: true,
                generation: true,
                translationReceived: true,
                translationDrawn: true,
                sourceDrawPhase: true,
                drawBoundary: true,
            });

            const RENDER_CYCLE_INITIAL_PHASES = Object.freeze([
                PHASES.SOURCE_DRAW_OBSERVED,
                PHASES.SOURCE_DRAW_COMMITTED,
                PHASES.TRANSLATION_KNOWN,
            ]);

            const RENDER_CYCLE_TRANSITIONS = Object.freeze({
                [PHASES.SOURCE_DRAW_OBSERVED]: Object.freeze([
                    PHASES.SOURCE_DRAW_COMMITTED,
                ]),
                [PHASES.SOURCE_DRAW_COMMITTED]: Object.freeze([
                    PHASES.TRANSLATION_KNOWN,
                    PHASES.RENDER_REJECTED,
                    PHASES.RENDER_NOOP,
                ]),
                [PHASES.TRANSLATION_KNOWN]: Object.freeze([
                    PHASES.RENDER_ADMITTED,
                    PHASES.RENDER_REJECTED,
                    PHASES.RENDER_NOOP,
                ]),
                [PHASES.RENDER_ADMITTED]: Object.freeze([
                    PHASES.RENDER_DEFERRED,
                    PHASES.RENDER_COMMITTED,
                    PHASES.RENDER_REJECTED,
                    PHASES.RENDER_NOOP,
                ]),
                [PHASES.RENDER_DEFERRED]: Object.freeze([
                    PHASES.RENDER_ADMITTED,
                    PHASES.RENDER_COMMITTED,
                    PHASES.RENDER_REJECTED,
                    PHASES.RENDER_NOOP,
                ]),
                [PHASES.RENDER_COMMITTED]: Object.freeze([]),
                [PHASES.RENDER_REJECTED]: Object.freeze([]),
                [PHASES.RENDER_NOOP]: Object.freeze([]),
            });

            let nextTransactionId = 0;

            function createDrawBoundary(input = {}) {
                const source = objectOrEmpty(input);
                const phase = normalizePhase(source.phase, PHASES.SOURCE_DRAW_OBSERVED);
                const generation = finiteNumber(source.generation !== undefined ? source.generation : source.entryGeneration, 0);
                return freezePlainObject({
                    id: firstString(source.id, source.boundaryId, `draw:${++nextTransactionId}`),
                    phase,
                    status: PHASE_STATUS[phase] || '',
                    adapterId: firstString(source.adapterId, source.sourceAdapter),
                    itemId: firstString(source.itemId, source.recordId),
                    recordId: firstString(source.recordId, source.itemId),
                    surfaceId: firstString(source.surfaceId),
                    identitySurfaceId: firstString(source.identitySurfaceId),
                    slotKey: firstString(source.slotKey),
                    generation,
                    entryGeneration: generation,
                    runId: firstString(source.runId, source.sourceRunId, source.textRunId),
                    unitIds: cloneStringList(source.unitIds || source.units),
                    surfaceRevision: finiteNumber(source.surfaceRevision, source.revision, generation),
                    reason: firstString(source.reason),
                    startedAt: positiveNumber(source.startedAt, source.observedAt, Date.now()),
                    committedAt: positiveNumber(source.committedAt, source.completedAt, 0),
                    beforeNativePaint: phase === PHASES.SOURCE_DRAW_OBSERVED,
                    sourceCommitted: phase === PHASES.SOURCE_DRAW_COMMITTED,
                    details: copyPlainObject(source.details),
                });
            }

            function createSourceDrawBoundary(input = {}) {
                const source = objectOrEmpty(input);
                const phase = resolveSourceDrawPhase(source);
                return createDrawBoundary(Object.assign({}, source, {
                    phase,
                    reason: firstString(
                        source.reason,
                        phase === PHASES.SOURCE_DRAW_COMMITTED
                            ? 'source-draw-committed'
                            : 'source-draw-observed'
                    ),
                }));
            }

            function observeSourceDraw(input = {}) {
                return transitionDrawBoundary(createSourceDrawBoundary(input), PHASES.SOURCE_DRAW_OBSERVED, {
                    reason: firstString(input && input.reason, 'source-draw-observed'),
                });
            }

            function commitSourceDraw(boundary, details = {}) {
                return transitionDrawBoundary(boundary, PHASES.SOURCE_DRAW_COMMITTED, Object.assign({
                    reason: 'source-draw-committed',
                    committedAt: Date.now(),
                }, objectOrEmpty(details)));
            }

            function transitionDrawBoundary(boundary, phase, patch = {}) {
                const previous = boundary && typeof boundary === 'object' ? createDrawBoundary(boundary) : null;
                const source = Object.assign({}, previous || {}, objectOrEmpty(patch), {
                    phase,
                });
                const state = createDrawBoundary(source);
                return freezePlainObject({
                    status: state.status,
                    phase: state.phase,
                    previousPhase: previous ? previous.phase : '',
                    state,
                });
            }

            function createRenderTransaction(input = {}) {
                const source = objectOrEmpty(input);
                const phase = normalizePhase(source.phase, PHASES.TRANSLATION_KNOWN);
                const commandGeneration = finiteNumber(source.commandGeneration, finiteNumber(source.generation, 0));
                const drawBoundary = source.drawBoundary && typeof source.drawBoundary === 'object'
                    ? createDrawBoundary(source.drawBoundary)
                    : null;
                return freezePlainObject({
                    id: firstString(source.id, source.transactionId, `render:${++nextTransactionId}`),
                    phase,
                    status: PHASE_STATUS[phase] || '',
                    adapterId: firstString(source.adapterId, source.sourceAdapter),
                    itemId: firstString(source.itemId, source.recordId),
                    recordId: firstString(source.recordId, source.itemId),
                    surfaceId: firstString(source.surfaceId, drawBoundary && drawBoundary.surfaceId),
                    slotKey: firstString(source.slotKey, drawBoundary && drawBoundary.slotKey),
                    strategy: firstString(source.strategy),
                    commandId: firstString(source.commandId),
                    commandGeneration,
                    generation: finiteNumber(source.generation, commandGeneration),
                    translationReceived: firstString(source.translationReceived),
                    translationDrawn: firstString(source.translationDrawn),
                    reason: firstString(source.reason),
                    deferred: phase === PHASES.RENDER_DEFERRED,
                    terminal: phase === PHASES.RENDER_COMMITTED || phase === PHASES.RENDER_REJECTED || phase === PHASES.RENDER_NOOP,
                    drawBoundary,
                    details: copyPlainObject(source.details),
                });
            }

            function noteTranslationKnown(transaction, details = {}) {
                return transitionRenderTransaction(transaction, PHASES.TRANSLATION_KNOWN, details);
            }

            function admitRender(transaction, details = {}) {
                return transitionRenderTransaction(transaction, PHASES.RENDER_ADMITTED, details);
            }

            function deferRender(transaction, details = {}) {
                return transitionRenderTransaction(transaction, PHASES.RENDER_DEFERRED, details);
            }

            function commitRender(transaction, details = {}) {
                return transitionRenderTransaction(transaction, PHASES.RENDER_COMMITTED, details);
            }

            function rejectRender(transaction, details = {}) {
                return transitionRenderTransaction(transaction, PHASES.RENDER_REJECTED, details);
            }

            function noopRender(transaction, details = {}) {
                return transitionRenderTransaction(transaction, PHASES.RENDER_NOOP, details);
            }

            function transitionRenderTransaction(transaction, phase, patch = {}) {
                const previous = transaction && typeof transaction === 'object' ? createRenderTransaction(transaction) : null;
                const source = Object.assign({}, previous || {}, objectOrEmpty(patch), {
                    phase,
                    details: mergeDetails(previous && previous.details, patch && patch.details),
                });
                const state = createRenderTransaction(source);
                const commit = state.terminal || state.deferred
                    ? createRenderCommit(Object.assign({}, state, {
                        status: state.status,
                        mode: patch && patch.mode,
                        route: patch && patch.route,
                        reason: firstString(patch && patch.reason, state.reason, state.status),
                        surfaceProof: patch && patch.surfaceProof,
                        details: state.details,
                    }))
                    : null;
                return freezePlainObject({
                    status: state.status,
                    phase: state.phase,
                    previousPhase: previous ? previous.phase : '',
                    state,
                    commit,
                });
            }

            function createRenderCommit(input = {}) {
                const source = objectOrEmpty(input);
                const status = normalizeCommitStatus(source.status, source.phase);
                const phase = normalizePhase(source.phase, COMMIT_PHASE_BY_STATUS[status]);
                const kind = normalizeRenderCommitKind(source, status);
                const proofSource = resolveRenderSurfaceProofSource(source);
                const surfaceProof = proofSource ? createRenderSurfaceProof(proofSource) : null;
                const evidence = sanitizeRenderCommitDetails(source.evidence || source.details);
                const flattenedEvidence = filterRenderCommitEvidence(evidence);
                const drawBoundary = source.drawBoundary && typeof source.drawBoundary === 'object'
                    ? createDrawBoundary(source.drawBoundary)
                    : null;
                const commit = Object.assign({
                    schemaVersion: 1,
                    status,
                    phase,
                    committed: status === 'committed',
                    deferred: status === 'deferred',
                    rejected: status === 'rejected',
                    noop: status === 'noop',
                    terminal: status === 'committed' || status === 'rejected' || status === 'noop',
                    kind,
                    mode: firstString(source.mode),
                    route: firstString(source.route),
                    reason: firstString(source.reason, status),
                    details: evidence,
                }, flattenedEvidence, surfaceProof ? { surfaceProof } : {}, {
                    adapterId: firstString(source.adapterId, source.sourceAdapter),
                    itemId: firstString(source.itemId, source.recordId),
                    recordId: firstString(source.recordId, source.itemId),
                    surfaceId: firstString(source.surfaceId, drawBoundary && drawBoundary.surfaceId),
                    slotKey: firstString(source.slotKey, drawBoundary && drawBoundary.slotKey),
                    strategy: firstString(source.strategy),
                    commandId: firstString(source.commandId),
                    commandGeneration: finiteNumber(source.commandGeneration, 0),
                    generation: finiteNumber(source.generation, finiteNumber(source.commandGeneration, 0)),
                    translationReceived: firstString(source.translationReceived),
                    translationDrawn: firstString(source.translationDrawn),
                    sourceDrawPhase: drawBoundary ? drawBoundary.phase : '',
                    drawBoundary,
                });
                return freezePlainObject(commit);
            }

            function resolveRenderSurfaceProofSource(source) {
                const input = objectOrEmpty(source);
                if (input.surfaceProof && typeof input.surfaceProof === 'object') return input.surfaceProof;
                const evidence = objectOrEmpty(input.evidence);
                if (evidence.surfaceProof && typeof evidence.surfaceProof === 'object') return evidence.surfaceProof;
                const details = objectOrEmpty(input.details);
                if (details.surfaceProof && typeof details.surfaceProof === 'object') return details.surfaceProof;
                const copiedTargetProof = input.copiedTargetProof && typeof input.copiedTargetProof === 'object'
                    ? input.copiedTargetProof
                    : (evidence.copiedTargetProof && typeof evidence.copiedTargetProof === 'object'
                        ? evidence.copiedTargetProof
                        : (details.copiedTargetProof && typeof details.copiedTargetProof === 'object'
                            ? details.copiedTargetProof
                            : null));
                if (!copiedTargetProof) return null;
                return freezePlainObject({
                    copiedTargetProof,
                    copiedTargetRenderPlan: input.copiedTargetRenderPlan
                        || evidence.copiedTargetRenderPlan
                        || details.copiedTargetRenderPlan
                        || null,
                });
            }

            function sanitizeRenderCommitDetails(value) {
                const details = copyPlainObject(value);
                if (Object.prototype.hasOwnProperty.call(details, 'renderCommit')) {
                    delete details.renderCommit;
                }
                if (Object.prototype.hasOwnProperty.call(details, 'surfaceProof')) {
                    delete details.surfaceProof;
                }
                if (Object.prototype.hasOwnProperty.call(details, 'copiedTargetProof')) delete details.copiedTargetProof;
                if (Object.prototype.hasOwnProperty.call(details, 'copiedTargetRenderPlan')) delete details.copiedTargetRenderPlan;
                if (Object.prototype.hasOwnProperty.call(details, 'accepted')) delete details.accepted;
                if (Object.prototype.hasOwnProperty.call(details, 'committed')) delete details.committed;
                return details;
            }

            function filterRenderCommitEvidence(evidence) {
                const source = objectOrEmpty(evidence);
                const filtered = {};
                Object.keys(source).forEach((key) => {
                    if (RENDER_COMMIT_RESERVED_KEYS[key] === true) return;
                    filtered[key] = source[key];
                });
                return filtered;
            }

            function createRenderSurfaceProof(input = {}) {
                const source = objectOrEmpty(input);
                const targetSource = objectOrEmpty(source.target);
                const dirtySource = objectOrEmpty(source.dirtyUpload || source.bitmapDirtyUpload);
                const mutationSource = objectOrEmpty(source.mutation || source.renderSurfaceMutation);
                const nativeDrawSource = objectOrEmpty(source.nativeDraw);
                const copiedTargetSource = source.copiedTargets && typeof source.copiedTargets === 'object'
                    ? objectOrEmpty(source.copiedTargets)
                    : objectOrEmpty(source.copiedTargetProof);
                const copiedPlanSource = objectOrEmpty(source.copiedTargetRenderPlan);
                const copiedTargetDirtySource = objectOrEmpty(copiedTargetSource.dirtyUpload || copiedTargetSource.dirtyResult);
                const proofKind = firstString(source.proofKind, inferSurfaceProofKind(source));

                return freezePlainObject({
                    schemaVersion: 1,
                    proofKind,
                    target: freezePlainObject({
                        contentsSameAsEntry: booleanValue(targetSource.contentsSameAsEntry, source.contentsSameAsEntry),
                        windowContentsCurrent: booleanValue(targetSource.windowContentsCurrent, source.windowContentsCurrent),
                        currentEntryMatches: booleanValue(targetSource.currentEntryMatches, source.currentEntryMatches),
                        entryGeneration: finiteNumber(targetSource.entryGeneration, source.entryGeneration),
                        entryContentsRevision: nullableNumber(targetSource.entryContentsRevision, source.entryContentsRevision),
                        windowContentsRevision: nullableNumber(targetSource.windowContentsRevision, source.windowContentsRevision),
                        contentsWidth: finiteNumber(targetSource.contentsWidth, source.contentsWidth),
                        contentsHeight: finiteNumber(targetSource.contentsHeight, source.contentsHeight),
                        entryContentsWidth: finiteNumber(targetSource.entryContentsWidth, source.entryContentsWidth),
                        entryContentsHeight: finiteNumber(targetSource.entryContentsHeight, source.entryContentsHeight),
                    }),
                    dirtyUpload: freezePlainObject({
                        handled: booleanValue(dirtySource.handled, source.bitmapDirtyUploadHandled),
                        marked: booleanValue(dirtySource.marked, source.bitmapDirtyUploadMarked, source.bitmapMarkedDirty),
                        setDirty: booleanValue(dirtySource.setDirty, source.bitmapDirtyUploadSetDirty),
                        baseTextureUpdates: finiteNumber(dirtySource.baseTextureUpdates, source.bitmapDirtyUploadBaseTextureUpdates),
                        bitmapWidth: finiteNumber(dirtySource.bitmapWidth, source.bitmapDirtyUploadBitmapWidth),
                        bitmapHeight: finiteNumber(dirtySource.bitmapHeight, source.bitmapDirtyUploadBitmapHeight),
                        errors: finiteNumber(dirtySource.errors, source.bitmapDirtyUploadErrors),
                        reason: firstString(dirtySource.reason, source.bitmapDirtyUploadReason),
                    }),
                    mutation: freezePlainObject({
                        drawReadable: booleanValue(mutationSource.drawReadable, source.renderSurfaceMutationDrawReadable),
                        drawChanged: booleanValue(mutationSource.drawChanged, source.renderSurfaceMutationDrawChanged),
                        overallDrawChanged: booleanValue(mutationSource.overallDrawChanged, source.renderSurfaceMutationOverallDrawChanged),
                        drawRect: firstString(mutationSource.drawRect, source.renderSurfaceMutationDrawRect),
                        drawBeforeChecksum: finiteNumber(mutationSource.drawBeforeChecksum, source.renderSurfaceMutationDrawBeforeChecksum),
                        drawAfterChecksum: finiteNumber(mutationSource.drawAfterChecksum, source.renderSurfaceMutationDrawAfterChecksum),
                        stableSurface: booleanValue(mutationSource.stableSurface, source.stableSurface),
                        stableSurfacePrepared: booleanValue(mutationSource.stableSurfacePrepared, source.stableSurfacePrepared),
                        stableSurfaceCommitBack: booleanValue(mutationSource.stableSurfaceCommitBack, source.stableSurfaceCommitBack),
                        stableSurfaceCommitReadable: booleanValue(mutationSource.stableSurfaceCommitReadable, source.stableSurfaceCommitReadable),
                        stableSurfaceCommitChanged: booleanValue(mutationSource.stableSurfaceCommitChanged, source.stableSurfaceCommitChanged),
                    }),
                    nativeDraw: freezePlainObject({
                        drawTextExInputConverted: booleanValue(nativeDrawSource.drawTextExInputConverted, source.drawTextExInputConverted),
                        drawTextExInputHasEsc: booleanValue(nativeDrawSource.drawTextExInputHasEsc, source.drawTextExInputHasEsc),
                        processedTextHasEsc: booleanValue(nativeDrawSource.processedTextHasEsc, source.processedTextHasEsc),
                        nativeDrawTextExArgCount: finiteNumber(nativeDrawSource.nativeDrawTextExArgCount, source.nativeDrawTextExArgCount),
                        bitmapTextDrawCount: finiteNumber(nativeDrawSource.bitmapTextDrawCount, source.bitmapTextDrawCount),
                        bitmapBltDrawCount: finiteNumber(nativeDrawSource.bitmapBltDrawCount, source.bitmapBltDrawCount),
                        bitmapDrawPrimitiveCount: finiteNumber(nativeDrawSource.bitmapDrawPrimitiveCount, source.bitmapDrawPrimitiveCount),
                        bitmapDrawnTextPreview: firstString(nativeDrawSource.bitmapDrawnTextPreview, source.bitmapDrawnTextPreview),
                    }),
                    copiedTargets: freezePlainObject(copiedTargetProofSchema.normalizeCopiedTargetProof(Object.assign({}, copiedTargetSource, {
                        required: booleanValue(copiedTargetSource.required, source.requiresCopiedTarget, copiedPlanSource.proof && copiedPlanSource.proof.requiresCopiedTarget),
                        planned: booleanValue(copiedTargetSource.planned, copiedPlanSource.status === 'planned'),
                        materialized: finiteNumber(copiedTargetSource.materialized, copiedTargetSource.materializedTargets, copiedPlanSource.materializedTargets),
                        redrawn: finiteNumber(copiedTargetSource.redrawn, source.copiedTargets),
                        copiedTargets: finiteNumber(copiedTargetSource.copiedTargets, copiedPlanSource.copiedTargets),
                        targetSurfaceId: firstString(copiedTargetSource.targetSurfaceId),
                        restoreMaterialId: firstString(copiedTargetSource.restoreMaterialId),
                        compositionCount: finiteNumber(copiedTargetSource.compositionCount),
                        compositionCandidateCount: finiteNumber(copiedTargetSource.compositionCandidateCount, copiedTargetSource.candidateCount),
                        dirtyUpload: {
                            handled: booleanValue(copiedTargetDirtySource.handled),
                            marked: booleanValue(copiedTargetDirtySource.marked),
                            setDirty: booleanValue(copiedTargetDirtySource.setDirty),
                            baseTextureUpdates: finiteNumber(copiedTargetDirtySource.baseTextureUpdates),
                            bitmapWidth: finiteNumber(copiedTargetDirtySource.bitmapWidth),
                            bitmapHeight: finiteNumber(copiedTargetDirtySource.bitmapHeight),
                            errors: finiteNumber(copiedTargetDirtySource.errors),
                            reason: firstString(copiedTargetDirtySource.reason),
                        },
                        sourceContentsRole: firstString(copiedTargetSource.sourceContentsRole, source.sourceContentsRole, copiedPlanSource.proof && copiedPlanSource.proof.sourceContentsRole),
                        sourceCommitted: booleanValue(copiedTargetSource.sourceCommitted, source.sourceCommitted, copiedPlanSource.proof && copiedPlanSource.proof.sourceCommitted),
                    }))),
                });
            }

            function createRenderCycle(input = {}) {
                const source = objectOrEmpty(input);
                const phase = normalizePhase(source.phase, PHASES.SOURCE_DRAW_OBSERVED);
                const drawBoundary = source.drawBoundary && typeof source.drawBoundary === 'object'
                    ? createDrawBoundary(source.drawBoundary)
                    : null;
                const renderCommit = source.renderCommit && typeof source.renderCommit === 'object'
                    ? createRenderCommit(source.renderCommit)
                    : null;
                const cycleId = firstString(source.cycleId, source.id, `cycle:${++nextTransactionId}`);
                const commandGeneration = finiteNumber(source.commandGeneration, finiteNumber(source.generation, 0));
                return freezePlainObject({
                    schemaVersion: 1,
                    id: cycleId,
                    cycleId,
                    phase,
                    status: PHASE_STATUS[phase] || '',
                    adapterId: firstString(source.adapterId, source.sourceAdapter),
                    itemId: firstString(source.itemId, source.recordId),
                    recordId: firstString(source.recordId, source.itemId),
                    surfaceId: firstString(source.surfaceId, drawBoundary && drawBoundary.surfaceId),
                    identitySurfaceId: firstString(source.identitySurfaceId, drawBoundary && drawBoundary.identitySurfaceId),
                    slotKey: firstString(source.slotKey, drawBoundary && drawBoundary.slotKey),
                    generation: finiteNumber(source.generation, commandGeneration),
                    entryGeneration: finiteNumber(source.entryGeneration, finiteNumber(source.generation, commandGeneration)),
                    strategy: firstString(source.strategy, source.renderStrategy),
                    renderStrategy: firstString(source.renderStrategy, source.strategy),
                    commandId: firstString(source.commandId, source.renderCommand && source.renderCommand.id),
                    commandGeneration,
                    translationReceived: firstString(source.translationReceived),
                    translationDrawn: firstString(source.translationDrawn),
                    reason: firstString(source.reason),
                    deferred: phase === PHASES.RENDER_DEFERRED,
                    terminal: isRenderCycleTerminalPhase(phase),
                    drawBoundary,
                    renderCommand: copyPlainObject(source.renderCommand || source.command),
                    renderCommit,
                    details: copyPlainObject(source.details),
                });
            }

            function observeRenderCycleSourceDraw(input = {}) {
                const source = objectOrEmpty(input);
                const boundaryTransition = observeSourceDraw(source.drawBoundary && typeof source.drawBoundary === 'object'
                    ? Object.assign({}, source, source.drawBoundary)
                    : source);
                return transitionRenderCycle(null, PHASES.SOURCE_DRAW_OBSERVED, Object.assign({}, source, {
                    drawBoundary: boundaryTransition.state,
                    reason: firstString(source.reason, 'source-draw-observed'),
                }));
            }

            function commitRenderCycleSourceDraw(cycle, details = {}) {
                const previous = cycle && typeof cycle === 'object' ? createRenderCycle(cycle) : null;
                const patch = objectOrEmpty(details);
                const boundary = previous && previous.drawBoundary
                    ? commitSourceDraw(previous.drawBoundary, patch).state
                    : (patch.drawBoundary && typeof patch.drawBoundary === 'object'
                        ? createDrawBoundary(patch.drawBoundary)
                        : null);
                return transitionRenderCycle(previous, PHASES.SOURCE_DRAW_COMMITTED, Object.assign({}, patch, {
                    drawBoundary: boundary,
                    reason: firstString(patch.reason, 'source-draw-committed'),
                }));
            }

            function noteRenderCycleTranslationKnown(cycle, details = {}) {
                return transitionRenderCycle(cycle, PHASES.TRANSLATION_KNOWN, details);
            }

            function admitRenderCycle(cycle, details = {}) {
                return transitionRenderCycle(cycle, PHASES.RENDER_ADMITTED, details);
            }

            function deferRenderCycle(cycle, details = {}) {
                return transitionRenderCycle(cycle, PHASES.RENDER_DEFERRED, details);
            }

            function commitRenderCycle(cycle, details = {}) {
                return transitionRenderCycle(cycle, PHASES.RENDER_COMMITTED, details);
            }

            function rejectRenderCycle(cycle, details = {}) {
                return transitionRenderCycle(cycle, PHASES.RENDER_REJECTED, details);
            }

            function noopRenderCycle(cycle, details = {}) {
                return transitionRenderCycle(cycle, PHASES.RENDER_NOOP, details);
            }

            function transitionRenderCycle(cycle, phase, patch = {}) {
                const previous = cycle && typeof cycle === 'object' ? createRenderCycle(cycle) : null;
                const requestedPhase = normalizePhase(phase, PHASES.SOURCE_DRAW_OBSERVED);
                const validation = validateRenderCycleTransition(previous && previous.phase, requestedPhase);
                if (!validation.allowed) {
                    return createRejectedRenderCycleTransition(previous, requestedPhase, validation.reason, patch);
                }
                const patchObject = objectOrEmpty(patch);
                const mergedDetails = mergeDetails(previous && previous.details, patchObject.details);
                const state = createRenderCycle(Object.assign({}, previous || {}, patchObject, {
                    phase: requestedPhase,
                    details: mergedDetails,
                }));
                const commit = resolveRenderCycleCommit(state, patchObject);
                return freezePlainObject({
                    ok: true,
                    accepted: true,
                    valid: true,
                    status: state.status,
                    phase: state.phase,
                    previousPhase: previous ? previous.phase : '',
                    state,
                    event: createRenderCycleEvent('render-cycle.transition', state, previous, patchObject),
                    commit,
                });
            }

            function validateRenderCycleTransition(previousPhase, nextPhase) {
                const next = normalizePhase(nextPhase, '');
                const previous = normalizePhase(previousPhase, '');
                if (!next) {
                    return freezePlainObject({ allowed: false, reason: 'unknown render cycle phase' });
                }
                if (!previous) {
                    return freezePlainObject({
                        allowed: RENDER_CYCLE_INITIAL_PHASES.indexOf(next) >= 0,
                        reason: RENDER_CYCLE_INITIAL_PHASES.indexOf(next) >= 0 ? '' : 'render cycle must start from source draw or known translation',
                    });
                }
                const allowedNext = RENDER_CYCLE_TRANSITIONS[previous] || [];
                const allowed = allowedNext.indexOf(next) >= 0;
                return freezePlainObject({
                    allowed,
                    reason: allowed ? '' : `illegal render cycle transition: ${previous} -> ${next}`,
                });
            }

            function createRejectedRenderCycleTransition(previous, requestedPhase, reason, patch = {}) {
                const patchObject = objectOrEmpty(patch);
                const state = previous || null;
                return freezePlainObject({
                    ok: false,
                    accepted: false,
                    valid: false,
                    rejected: true,
                    status: 'rejected',
                    phase: state ? state.phase : '',
                    requestedPhase,
                    previousPhase: state ? state.phase : '',
                    reason,
                    state,
                    event: createRenderCycleEvent('render-cycle.transition_rejected', state, state, Object.assign({}, patchObject, {
                        requestedPhase,
                        reason,
                    })),
                    commit: null,
                });
            }

            function resolveRenderCycleCommit(state, patch = {}) {
                if (!state || typeof state !== 'object') return null;
                const sourceCommit = patch.renderCommit && typeof patch.renderCommit === 'object'
                    ? patch.renderCommit
                    : null;
                if (sourceCommit) {
                    return createRenderCommit(Object.assign({}, state, sourceCommit, {
                        details: mergeDetails(state.details, sourceCommit.details),
                    }));
                }
                if (!state.terminal && !state.deferred) return null;
                return createRenderCommit(Object.assign({}, state, {
                    status: state.status,
                    mode: patch.mode,
                    route: patch.route,
                    reason: firstString(patch.reason, state.reason, state.status),
                    surfaceProof: patch.surfaceProof,
                    details: state.details,
                }));
            }

            function createRenderCycleEvent(type, state, previous, patch = {}) {
                const source = state && typeof state === 'object' ? state : {};
                const patchObject = objectOrEmpty(patch);
                return freezePlainObject({
                    type,
                    cycleId: firstString(source.cycleId, source.id),
                    itemId: firstString(source.itemId, source.recordId),
                    recordId: firstString(source.recordId, source.itemId),
                    adapterId: firstString(source.adapterId),
                    surfaceId: firstString(source.surfaceId),
                    slotKey: firstString(source.slotKey),
                    phase: firstString(source.phase),
                    previousPhase: previous && previous.phase ? previous.phase : '',
                    requestedPhase: firstString(patchObject.requestedPhase),
                    status: firstString(source.status),
                    reason: firstString(patchObject.reason, source.reason),
                    commandId: firstString(source.commandId),
                    commandGeneration: finiteNumber(source.commandGeneration, 0),
                    generation: finiteNumber(source.generation, 0),
                });
            }

            function isRenderCycleTerminalPhase(phase) {
                const normalized = normalizePhase(phase, '');
                return normalized === PHASES.RENDER_COMMITTED
                    || normalized === PHASES.RENDER_REJECTED
                    || normalized === PHASES.RENDER_NOOP;
            }

            function resolveSourceDrawPhase(input = {}) {
                const source = objectOrEmpty(input);
                const phase = normalizePhase(source.phase, '');
                if (phase === PHASES.SOURCE_DRAW_OBSERVED || phase === PHASES.SOURCE_DRAW_COMMITTED) {
                    return phase;
                }
                if (source.sourceCommitted === true || source.beforeNativePaint === false) {
                    return PHASES.SOURCE_DRAW_COMMITTED;
                }
                return PHASES.SOURCE_DRAW_OBSERVED;
            }

            function normalizePhase(value, fallback = PHASES.TRANSLATION_KNOWN) {
                const phase = firstString(value).replace(/_/g, '-').toLowerCase();
                if (phase === 'observed-source-draw') return PHASES.SOURCE_DRAW_OBSERVED;
                if (phase === 'committed-source-draw') return PHASES.SOURCE_DRAW_COMMITTED;
                const values = Object.keys(PHASES).map((key) => PHASES[key]);
                return values.indexOf(phase) >= 0 ? phase : fallback;
            }

            function normalizeCommitStatus(status, phase) {
                const value = firstString(status).replace(/_/g, '-').toLowerCase();
                // Legacy input alias: remove after retained renderCommit payloads stop
                // using accepted/rendered to mean committed pixels.
                if (value === 'accepted' || value === 'rendered' || value === 'committed') return 'committed';
                if (value === 'deferred' || value === 'queued' || value === 'pending') return 'deferred';
                if (value === 'noop' || value === 'no-op' || value === 'skipped') return 'noop';
                if (value === 'rejected' || value === 'failed') return 'rejected';
                const normalizedPhase = normalizePhase(phase, '');
                if (normalizedPhase === PHASES.RENDER_COMMITTED) return 'committed';
                if (normalizedPhase === PHASES.RENDER_DEFERRED) return 'deferred';
                if (normalizedPhase === PHASES.RENDER_NOOP) return 'noop';
                return 'rejected';
            }

            function normalizeRenderCommitKind(input = {}, status = '') {
                const source = objectOrEmpty(input);
                const normalizedStatus = normalizeCommitStatus(status || source.status, source.phase);
                if (normalizedStatus === 'rejected') return RENDER_COMMIT_KINDS.REJECTED;
                if (normalizedStatus === 'noop') return RENDER_COMMIT_KINDS.NO_OP;
                const explicit = normalizeKnownRenderCommitKind(source.kind || source.commitKind || source.renderKind);
                if (explicit) return explicit;
                const mode = normalizeCommitLabel(source.mode);
                const route = normalizeCommitLabel(source.route);
                const strategy = normalizeCommitLabel(source.strategy || source.renderStrategy);
                const details = objectOrEmpty(source.details || source.evidence);
                const detailMode = normalizeCommitLabel(details.mode || details.renderMode || details.route);
                return inferRenderCommitKind(mode, route, strategy, detailMode, normalizedStatus);
            }

            function inferRenderCommitKind(...labels) {
                const status = labels[labels.length - 1];
                const values = labels.slice(0, -1).filter(Boolean);
                if (values.some((value) => value.includes('sprite') || value.includes('overlay'))) {
                    return RENDER_COMMIT_KINDS.OVERLAY_REDRAW;
                }
                if (values.some((value) => value.includes('bitmap'))) {
                    return RENDER_COMMIT_KINDS.BITMAP_REDRAW;
                }
                if (values.some((value) => value === 'native-substitution' || value.includes('substitution'))) {
                    return RENDER_COMMIT_KINDS.NATIVE_SUBSTITUTION;
                }
                if (values.some((value) => value.includes('async') || value.includes('redraw') || value.includes('window') || value.includes('message') || value.includes('replay'))) {
                    return RENDER_COMMIT_KINDS.ASYNC_REDRAW;
                }
                return status === 'deferred'
                    ? RENDER_COMMIT_KINDS.ASYNC_REDRAW
                    : RENDER_COMMIT_KINDS.NATIVE_SUBSTITUTION;
            }

            function normalizeKnownRenderCommitKind(value) {
                const kind = normalizeCommitLabel(value);
                const known = Object.keys(RENDER_COMMIT_KINDS).map((key) => RENDER_COMMIT_KINDS[key]);
                return known.indexOf(kind) >= 0 ? kind : '';
            }

            function normalizeCommitLabel(value) {
                return firstString(value).replace(/_/g, '-').toLowerCase();
            }

            function inferSurfaceProofKind(source = {}) {
                const proof = objectOrEmpty(source);
                const mutation = objectOrEmpty(proof.mutation || proof.renderSurfaceMutation);
                if (proof.stableSurfaceCommitBack === true || mutation.stableSurfaceCommitBack === true) {
                    return 'stable-surface-commit';
                }
                if (proof.renderSurfaceMutationDrawChanged === true
                    || proof.renderSurfaceMutationOverallDrawChanged === true
                    || mutation.drawChanged === true
                    || mutation.overallDrawChanged === true) {
                    return 'bitmap-surface-mutation';
                }
                if (proof.bitmapDirtyUploadMarked === true
                    || proof.bitmapMarkedDirty === true
                    || objectOrEmpty(proof.dirtyUpload || proof.bitmapDirtyUpload).marked === true) {
                    return 'dirty-upload';
                }
                return 'surface-proof';
            }

            function objectOrEmpty(value) {
                return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            }

            function copyPlainObject(value) {
                const source = objectOrEmpty(value);
                return Object.assign({}, source);
            }

            function mergeDetails(...values) {
                const merged = {};
                values.forEach((value) => {
                    Object.assign(merged, copyPlainObject(value));
                });
                return merged;
            }

            function cloneStringList(value) {
                const source = Array.isArray(value) ? value : [];
                const output = [];
                source.forEach((item) => {
                    const text = firstString(item);
                    if (text && output.indexOf(text) < 0) output.push(text);
                });
                return output;
            }

            function firstString(...values) {
                for (const value of values) {
                    if (value === undefined || value === null) continue;
                    if (typeof value === 'string') {
                        if (value) return value;
                        continue;
                    }
                    if (typeof value === 'object') continue;
                    const text = String(value);
                    if (text) return text;
                }
                return '';
            }

            function booleanValue(...values) {
                for (const value of values) {
                    if (value === true) return true;
                    if (value === false) return false;
                }
                return false;
            }

            function finiteNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

            function nullableNumber(...values) {
                for (const value of values) {
                    if (value === undefined || value === null) continue;
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return null;
            }

            function positiveNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 0;
            }

            function freezePlainObject(value) {
                if (!value || typeof value !== 'object') return value;
                try { return Object.freeze(value); } catch (_) { return value; }
            }

            return {
                PHASES,
                PHASE_STATUS,
                RENDER_COMMIT_KINDS,
                RENDER_CYCLE_TRANSITIONS,
                createDrawBoundary,
                createSourceDrawBoundary,
                observeSourceDraw,
                commitSourceDraw,
                transitionDrawBoundary,
                createRenderTransaction,
                noteTranslationKnown,
                admitRender,
                deferRender,
                commitRender,
                rejectRender,
                noopRender,
                transitionRenderTransaction,
                createRenderCommit,
                createRenderSurfaceProof,
                createRenderCycle,
                observeRenderCycleSourceDraw,
                commitRenderCycleSourceDraw,
                noteRenderCycleTranslationKnown,
                admitRenderCycle,
                deferRenderCycle,
                commitRenderCycle,
                rejectRenderCycle,
                noopRenderCycle,
                transitionRenderCycle,
                validateRenderCycleTransition,
                normalizePhase,
                normalizeCommitStatus,
                normalizeRenderCommitKind,
            };
        },
    });
})();
