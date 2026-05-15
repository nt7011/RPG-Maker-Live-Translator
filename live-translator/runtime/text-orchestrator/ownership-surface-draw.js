// Text orchestrator ownership support: surface draw routing.
// Routes raw Bitmap draw facts to the adapter that owns or may consume them.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/ownership-surface-draw.js.');
    }

    function createController(scope = {}) {
        const { firstString, surfaceDrawListeners } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            claimText,
            findTextOwnershipBlocker,
            getOwnershipBucket,
            getSurfaceWinner,
            normalizeOwnershipDescriptor,
            ownershipNumber,
        } = Object.fromEntries([
            'claimText',
            'findTextOwnershipBlocker',
            'getOwnershipBucket',
            'getSurfaceWinner',
            'normalizeOwnershipDescriptor',
            'ownershipNumber',
        ].map((name) => [name, callScope(name)]));

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
            const candidateAdapters = Array.isArray(source.candidateAdapters)
                ? source.candidateAdapters.map((value) => firstString(value)).filter(Boolean)
                : [];
            return Object.assign(descriptor, {
                methodName: firstString(source.methodName, 'drawText'),
                x: ownershipNumber(source.x, 0),
                y: ownershipNumber(source.y, 0),
                maxWidth: ownershipNumber(source.maxWidth, 0),
                lineHeight: ownershipNumber(source.lineHeight, 0),
                align: firstString(source.align, 'left'),
                drawState: source.drawState && typeof source.drawState === 'object'
                    ? Object.assign({}, source.drawState)
                    : null,
                measuredWidth: ownershipNumber(
                    source.measuredWidth !== undefined ? source.measuredWidth : source.width,
                    0
                ),
                ownerType: firstString(source.ownerType),
                standaloneGlyph: source.standaloneGlyph === true,
                candidateAdapters,
            });
        }

        function hasSurfaceDrawListener(adapterId) {
            let found = false;
            surfaceDrawListeners.forEach((subscription) => {
                if (subscription && subscription.adapterId === adapterId) found = true;
            });
            return found;
        }

        function emitSurfaceDraw(adapterId, descriptor, status, ownerClaim) {
            const event = {
                type: 'surface.draw',
                adapterId,
                sourceAdapter: descriptor.adapterId,
                status,
                ownerAdapter: ownerClaim ? ownerClaim.adapterId : adapterId,
                ownerClaimId: ownerClaim ? ownerClaim.id : '',
                reason: ownerClaim ? 'surface-owned' : status,
                target: descriptor.target,
                payload: createSurfaceDrawPayload(descriptor, status),
            };
            let drawDecision = null;
            surfaceDrawListeners.forEach((subscription) => {
                if (!subscription || subscription.adapterId !== adapterId) return;
                try {
                    const nextDecision = normalizeSurfaceDrawDecision(subscription.listener(event));
                    if (!drawDecision && nextDecision) drawDecision = nextDecision;
                } catch (_) {}
            });
            return drawDecision;
        }

        function normalizeSurfaceDrawDecision(input) {
            if (!input || typeof input !== 'object') return null;
            const action = normalizeSurfaceDrawAction(input.action || input.nativeDrawAction);
            const text = firstString(input.text, input.replacementText, input.translatedText);
            if (action === 'replace-native-draw' && !text) return null;
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
            return {
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
            };
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
            }, drawDecision ? { drawDecision } : {});
        }

        return { recordSurfaceDraw, subscribeSurfaceDraws, normalizeSurfaceDrawDescriptor, hasSurfaceDrawListener, emitSurfaceDraw, createSurfaceDrawPayload, createSurfaceDrawResult, normalizeSurfaceDrawDecision };
    }

    defineRuntimeModule('runtime.textOrchestratorOwnershipSurfaceDraw', { create: createController });
})();
