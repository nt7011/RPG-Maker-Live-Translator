// Text orchestrator ownership support: surface draw routing.
// Routes raw Bitmap draw facts to the adapter that owns or may consume them.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.ownershipSurfaceDraw',
        requires: {
            renderTransaction: 'runtime.renderTransaction',
            surfaceDrawDescriptor: 'runtime.surfaceDrawDescriptor',
        },
        factory({ renderTransaction, surfaceDrawDescriptor }) {

            function createController(scope = {}) {
                const { firstString, surfaceDrawListeners } = scope;
                const { claimText, findTextOwnershipBlocker, getOwnershipBucket, getSurfaceWinner, normalizeOwnershipDescriptor, ownershipNumber } = scope.controllerFacades.ownership;

                /**
                 * Publish a raw Bitmap draw through the ownership registry.
                 *
                 * The bitmap adapter owns the hook mechanics, but the orchestrator owns
                 * the answer to "which adapter may consume this draw?" Sprite receives
                 * only routed/deferred draws through subscribeSurfaceDraws().
                 */
                function recordSurfaceDraw(input = {}) {
                    const descriptor = normalizeSurfaceDrawDescriptor(input);
                    if (!descriptor.target) {
                        return createSurfaceDrawResult('ignored', descriptor, null, null, 'missing-target');
                    }

                    const textBlocker = findTextOwnershipBlocker(descriptor);
                    if (textBlocker) {
                        return createSurfaceDrawResult('claimed', descriptor, textBlocker.claim, null, textBlocker.reason);
                    }

                    const bucket = getOwnershipBucket(descriptor.target, false);
                    const winner = bucket ? getSurfaceWinner(bucket) : null;
                    if (winner && winner.adapterId !== descriptor.adapterId) {
                        const drawDecision = emitSurfaceDraw(winner.adapterId, descriptor, 'claimed', winner);
                        return createSurfaceDrawResult('claimed', descriptor, winner, null, 'surface-owned', drawDecision);
                    }

                    let deferred = false;
                    for (const candidate of descriptor.candidateAdapters) {
                        if (!candidate || candidate === descriptor.adapterId) continue;
                        if (hasSurfaceDrawListener(candidate)) {
                            emitSurfaceDraw(candidate, descriptor, 'deferred', null);
                            deferred = true;
                        }
                    }

                    const claim = claimText(Object.assign({}, descriptor, {
                        mode: descriptor.mode || 'bitmapFallback',
                        provisional: true,
                    }));
                    if (!claim || claim.status === 'denied') {
                        return createSurfaceDrawResult('claimed', descriptor, claim, null, claim && claim.reason);
                    }
                    return createSurfaceDrawResult(deferred ? 'deferred' : 'fallback', descriptor, null, claim, deferred ? 'deferred-to-owner-candidate' : 'fallback-owned');
                }

                function subscribeSurfaceDraws(listener, options = {}) {
                    if (typeof listener !== 'function') return () => {};
                    const subscription = {
                        listener,
                        adapterId: firstString(options && options.adapterId),
                        token: firstString(options && options.token, 'surface-draws'),
                    };
                    surfaceDrawListeners.add(subscription);
                    return () => {
                        surfaceDrawListeners.delete(subscription);
                    };
                }

                // Surface draw descriptors extend the shared ownership shape with the
                // draw geometry needed by sprite/bitmap fallback coordination.
                function normalizeSurfaceDrawDescriptor(input = {}) {
                    const source = input && typeof input === 'object' ? input : {};
                    const descriptor = normalizeOwnershipDescriptor(Object.assign({
                        mode: 'bitmapFallback',
                        role: 'bitmap-draw',
                    }, source), 'draw');
                    const facts = surfaceDrawDescriptor.normalizeDrawFacts(source, {
                        target: descriptor.target,
                        sourceAdapter: descriptor.adapterId,
                    });
                    const candidateAdapters = Array.isArray(source.candidateAdapters)
                        ? source.candidateAdapters.map((value) => firstString(value)).filter(Boolean)
                        : [];
                    const normalized = Object.assign(descriptor, {
                        methodName: facts.methodName,
                        x: facts.x,
                        y: facts.y,
                        maxWidth: facts.maxWidth,
                        lineHeight: facts.lineHeight,
                        align: facts.align,
                        drawState: facts.drawState,
                        measuredWidth: facts.measuredWidth,
                        ownerType: facts.ownerType,
                        standaloneGlyph: facts.standaloneGlyph,
                        runId: facts.runId,
                        unitIds: facts.unitIds,
                        surfaceRevision: facts.surfaceRevision,
                        drawRun: facts.drawRun,
                        backgroundPatch: facts.backgroundPatch,
                        restoreMaterials: facts.restoreMaterials,
                        sourceCommitted: facts.sourceCommitted,
                        phase: facts.sourceCommitted ? 'source-draw-committed' : 'source-draw-observed',
                        nativeDrawCapability: facts.sourceCommitted ? 'committed' : 'observed',
                        candidateAdapters,
                    });
                    return Object.assign(normalized, {
                        drawBoundary: createSurfaceDrawBoundary(normalized, source),
                    });
                }

                function createSurfaceDrawBoundary(descriptor, source = {}) {
                    return renderTransaction.createSourceDrawBoundary(Object.assign({
                        adapterId: descriptor.adapterId,
                        surfaceId: descriptor.surfaceId,
                        slotKey: descriptor.slotKey || createSurfaceDrawSlotKey(descriptor),
                        generation: ownershipNumber(source.generation !== undefined ? source.generation : source.revision, 0),
                        runId: descriptor.runId || source.runId || source.sourceRunId || '',
                        unitIds: Array.isArray(descriptor.unitIds) ? descriptor.unitIds.slice() : [],
                        surfaceRevision: ownershipNumber(descriptor.surfaceRevision !== undefined ? descriptor.surfaceRevision : source.surfaceRevision, 0),
                        sourceCommitted: descriptor.sourceCommitted === true || source.sourceCommitted === true,
                        beforeNativePaint: descriptor.sourceCommitted === true || source.sourceCommitted === true
                            ? false
                            : source.beforeNativePaint,
                        reason: descriptor.sourceCommitted === true ? 'surface-draw-committed' : 'surface-draw-observed',
                        details: {
                            methodName: descriptor.methodName,
                            mode: descriptor.mode,
                            ownerType: descriptor.ownerType,
                        },
                    }, source.drawBoundary && typeof source.drawBoundary === 'object' ? source.drawBoundary : {}));
                }

                function createSurfaceDrawSlotKey(descriptor) {
                    return [
                        descriptor.methodName || 'drawText',
                        descriptor.x,
                        descriptor.y,
                        descriptor.maxWidth,
                        descriptor.lineHeight,
                        descriptor.align || 'left',
                    ].map((value) => firstString(value)).join(':');
                }

                function hasSurfaceDrawListener(adapterId) {
                    let found = false;
                    surfaceDrawListeners.forEach((subscription) => {
                        if (subscription && subscription.adapterId === adapterId) found = true;
                    });
                    return found;
                }

                function emitSurfaceDraw(adapterId, descriptor, status, ownerClaim) {
                    const event = createSurfaceDrawEvent(adapterId, descriptor, status, ownerClaim);
                    let drawDecision = null;
                    surfaceDrawListeners.forEach((subscription) => {
                        if (!subscription || subscription.adapterId !== adapterId) return;
                        try {
                            const nextDecision = normalizeSurfaceDrawDecision(subscription.listener(event), event);
                            if (!drawDecision && nextDecision) drawDecision = nextDecision;
                        } catch (_) {}
                    });
                    return drawDecision;
                }

                function createSurfaceDrawEvent(adapterId, descriptor, status, ownerClaim) {
                    const phase = descriptor.phase || (descriptor.sourceCommitted ? 'source-draw-committed' : 'source-draw-observed');
                    const sourceCommitted = descriptor.sourceCommitted === true || phase === 'source-draw-committed';
                    // Surface routing is an observation bus. Native substitution is
                    // limited to the bitmap inline replacement index before the draw.
                    const nativeDrawCapability = sourceCommitted ? 'committed' : 'observed';
                    return {
                        type: 'surface.draw',
                        adapterId,
                        sourceAdapter: descriptor.adapterId,
                        phase,
                        sourcePhase: phase,
                        sourceCommitted,
                        nativeDrawCapability,
                        canReplaceNativeDraw: false,
                        canSuppressNativeDraw: false,
                        status,
                        ownershipStatus: status,
                        ownerAdapter: ownerClaim ? ownerClaim.adapterId : adapterId,
                        ownerClaimId: ownerClaim ? ownerClaim.id : '',
                        reason: ownerClaim ? 'surface-owned' : status,
                        target: descriptor.target,
                        drawBoundary: descriptor.drawBoundary,
                        payload: createSurfaceDrawPayload(descriptor, status),
                    };
                }

                function normalizeSurfaceDrawDecision(input, event = null) {
                    if (!input || typeof input !== 'object') return null;
                    const action = normalizeSurfaceDrawAction(input.action || input.nativeDrawAction);
                    const text = firstString(input.text, input.replacementText, input.translatedText);
                    if (action === 'replace-native-draw' && !text) return null;
                    if (event && event.canReplaceNativeDraw !== true) {
                        return null;
                    }
                    if (!action) return null;
                    return {
                        action,
                        text,
                        x: ownershipNumber(input.x, NaN),
                        y: ownershipNumber(input.y, NaN),
                        maxWidth: ownershipNumber(input.maxWidth, NaN),
                        lineHeight: ownershipNumber(input.lineHeight, NaN),
                        align: firstString(input.align),
                        reason: firstString(input.reason),
                    };
                }

                function normalizeSurfaceDrawAction(action) {
                    const value = firstString(action).replace(/_/g, '-').toLowerCase();
                    if (value === 'replace-native-draw' || value === 'replace-native' || value === 'replace') {
                        return 'replace-native-draw';
                    }
                    if (value === 'suppress-native-draw' || value === 'skip-native' || value === 'suppress') {
                        return 'suppress-native-draw';
                    }
                    if (value === 'draw-original' || value === 'native' || value === 'original') {
                        return 'draw-original';
                    }
                    return '';
                }

                function createSurfaceDrawPayload(descriptor, status) {
                    return surfaceDrawDescriptor.createSurfaceDrawPayload({
                        target: descriptor.target,
                        bitmap: descriptor.target,
                        methodName: descriptor.methodName,
                        text: descriptor.text,
                        rawText: descriptor.text,
                        x: descriptor.x,
                        y: descriptor.y,
                        maxWidth: descriptor.maxWidth,
                        lineHeight: descriptor.lineHeight,
                        align: descriptor.align,
                        drawState: descriptor.drawState,
                        measuredWidth: descriptor.measuredWidth,
                        ownerType: descriptor.ownerType,
                        ownershipStatus: status,
                        sourceAdapter: descriptor.adapterId,
                        runId: descriptor.runId,
                        unitIds: descriptor.unitIds,
                        surfaceRevision: descriptor.surfaceRevision,
                        drawBoundary: descriptor.drawBoundary,
                        drawRun: descriptor.drawRun,
                        backgroundPatch: descriptor.backgroundPatch,
                        restoreMaterials: descriptor.restoreMaterials,
                        sourceCommitted: descriptor.sourceCommitted,
                    }, status);
                }

                function createSurfaceDrawResult(status, descriptor, ownerClaim, fallbackClaim, reason, drawDecision = null) {
                    const claimResult = fallbackClaim && fallbackClaim.token ? fallbackClaim : null;
                    return Object.assign({
                        status,
                        ownerAdapter: ownerClaim && ownerClaim.adapterId
                            ? ownerClaim.adapterId
                            : (status === 'fallback' || status === 'deferred' ? descriptor.adapterId : ''),
                        ownerClaimId: ownerClaim && ownerClaim.id ? ownerClaim.id : '',
                        reason: firstString(reason),
                        token: claimResult ? claimResult.token : null,
                        ownershipToken: claimResult ? claimResult.token : null,
                        claimId: claimResult ? claimResult.claimId : '',
                        drawBoundary: descriptor.drawBoundary,
                    }, drawDecision ? { drawDecision } : {});
                }

                return { recordSurfaceDraw, subscribeSurfaceDraws, normalizeSurfaceDrawDescriptor, hasSurfaceDrawListener, emitSurfaceDraw, createSurfaceDrawEvent, createSurfaceDrawPayload, createSurfaceDrawResult, normalizeSurfaceDrawDecision };
            }

            return { create: createController };
        },
    });
})();
