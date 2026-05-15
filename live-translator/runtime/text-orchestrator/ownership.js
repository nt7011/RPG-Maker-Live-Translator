// Text orchestrator support: ownership.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/ownership.js.');
    }

    function createController(scope = {}) {
        const { OWNERSHIP_PRIORITY, firstString, finiteNumber, pickSerializableObject, ownershipBucketsByTarget, ownershipClaimsByToken, textClaimsById } = scope;

        /**
         * Claim exclusive ownership of a render surface.
         *
         * Adapters receive an opaque token instead of direct registry access.
         * Higher-priority adapters preempt lower-priority provisional work on
         * the same target; lower-priority adapters are denied deterministically.
         */
        function claimSurface(input = {}) {
            const descriptor = normalizeOwnershipDescriptor(input, 'surface');
            const bucket = getOwnershipBucket(descriptor.target, true);
            if (!bucket) return createOwnershipDeniedResult('missing-target', null, descriptor);

            const winner = getSurfaceWinner(bucket);
            if (winner && winner.adapterId !== descriptor.adapterId && winner.priority >= descriptor.priority) {
                return createOwnershipDeniedResult('surface-owned', winner, descriptor);
            }

            const claim = createOwnershipClaim('surface', descriptor, bucket);
            bucket.surfaceClaims.add(claim);
            preemptLowerPriorityClaims(bucket, claim);
            return cloneOwnershipResult('claimed', claim, null, descriptor);
        }

        function releaseSurface(token, reason = 'surface released') {
            return releaseOwnershipToken(token, 'surface', reason);
        }

        /**
         * Claim one text observation before it becomes a canonical TextItem.
         *
         * Bitmap fallback uses provisional text claims so sprite/window/message
         * surface claims can revoke them before frame-boundary aggregation.
         * Message text uses guarded claims so transient glyph bitmaps are owned
         * by the message adapter without bitmap needing a message-specific API.
         */
        function claimText(input = {}) {
            const descriptor = normalizeOwnershipDescriptor(input, 'text');
            const blocker = findTextOwnershipBlocker(descriptor);
            if (blocker) return createOwnershipDeniedResult(blocker.reason, blocker.claim, descriptor);

            const bucket = getOwnershipBucket(descriptor.target, true);
            if (bucket) {
                const winner = getSurfaceWinner(bucket);
                if (winner && winner.adapterId !== descriptor.adapterId && winner.priority >= descriptor.priority) {
                    return createOwnershipDeniedResult('surface-owned', winner, descriptor);
                }
            }

            const claim = createOwnershipClaim('text', descriptor, bucket);
            textClaimsById.set(claim.id, claim);
            if (bucket) bucket.textClaims.add(claim);
            return cloneOwnershipResult(claim.provisional ? 'provisional' : 'claimed', claim, null, descriptor);
        }

        function finalizeTextClaim(token, input = {}) {
            const claim = getOwnershipClaimForToken(token);
            if (!claim || claim.kind !== 'text' || claim.active !== true) {
                return createOwnershipDeniedResult('stale-claim', claim, normalizeOwnershipDescriptor(input, 'text'));
            }
            const descriptor = normalizeOwnershipDescriptor(Object.assign({}, claim.descriptor || {}, input || {}, {
                sourceAdapter: claim.adapterId,
                target: claim.target,
                mode: claim.mode,
            }), 'text');
            const blocker = findTextOwnershipBlocker(descriptor, claim);
            if (blocker) {
                revokeOwnershipClaim(claim, blocker.reason);
                return createOwnershipDeniedResult(blocker.reason, blocker.claim, descriptor);
            }
            const bucket = claim.bucket || getOwnershipBucket(claim.target, false);
            if (bucket) {
                const winner = getSurfaceWinner(bucket);
                if (winner && winner.adapterId !== claim.adapterId && winner.priority >= claim.priority) {
                    revokeOwnershipClaim(claim, 'surface-owned');
                    return createOwnershipDeniedResult('surface-owned', winner, descriptor);
                }
            }
            claim.provisional = false;
            claim.status = 'claimed';
            claim.updatedAt = Date.now();
            return cloneOwnershipResult('claimed', claim, null, descriptor);
        }

        function releaseTextClaim(token, reason = 'text claim released') {
            return releaseOwnershipToken(token, 'text', reason);
        }

        // All ownership callers pass through this normalized descriptor so the
        // arbitration rules do not depend on adapter-specific field names.
        function normalizeOwnershipDescriptor(input = {}, defaultKind = 'text') {
            const source = input && typeof input === 'object' ? input : {};
            const adapterId = firstString(source.sourceAdapter, source.adapterId, source.hook, 'text');
            const mode = firstString(source.mode, source.role, defaultKind);
            const text = firstString(source.text, source.visibleText, source.rawText, source.translationSource);
            const explicitPriority = finiteNumber(source.priority);
            return {
                adapterId,
                sourceAdapter: adapterId,
                target: resolveOwnershipTarget(source),
                surfaceId: firstString(source.surfaceId),
                surfaceType: firstString(source.surfaceType, source.kind, defaultKind),
                slotKey: firstString(source.slotKey),
                mode,
                role: firstString(source.role, mode),
                text,
                normalizedText: normalizeOwnershipText(text),
                searchText: normalizeOwnershipText(firstString(source.searchText, text)),
                priority: explicitPriority === null || explicitPriority === undefined
                    ? getDefaultOwnershipPriority(adapterId)
                    : explicitPriority,
                provisional: source.provisional === true,
                exclusive: source.exclusive !== false,
                metadata: pickSerializableObject(source.metadata || {}),
            };
        }

        function resolveOwnershipTarget(source = {}) {
            return source.target
                || source.bitmap
                || source.window
                || source.windowInstance
                || source.sprite
                || source.owner
                || null;
        }

        function getOwnershipBucket(target, create) {
            if (!target || (typeof target !== 'object' && typeof target !== 'function')) return null;
            if (!ownershipBucketsByTarget) return null;
            let bucket = ownershipBucketsByTarget.get(target);
            if (!bucket && create) {
                bucket = {
                    surfaceClaims: new Set(),
                    textClaims: new Set(),
                };
                ownershipBucketsByTarget.set(target, bucket);
            }
            return bucket || null;
        }

        function createOwnershipClaim(kind, descriptor, bucket) {
            const token = Object.freeze({
                id: `own:${(++scope.ownershipSequence).toString(36)}`,
                kind,
            });
            const now = Date.now();
            const claim = {
                id: token.id,
                token,
                kind,
                adapterId: descriptor.adapterId,
                target: descriptor.target || null,
                bucket: bucket || null,
                surfaceId: descriptor.surfaceId,
                surfaceType: descriptor.surfaceType,
                slotKey: descriptor.slotKey,
                mode: descriptor.mode,
                role: descriptor.role,
                priority: descriptor.priority,
                text: descriptor.text,
                normalizedText: descriptor.normalizedText,
                searchText: descriptor.searchText,
                provisional: descriptor.provisional === true,
                exclusive: descriptor.exclusive !== false,
                metadata: descriptor.metadata || {},
                descriptor,
                active: true,
                status: descriptor.provisional ? 'provisional' : 'claimed',
                reason: '',
                createdAt: now,
                updatedAt: now,
            };
            if (ownershipClaimsByToken) ownershipClaimsByToken.set(token, claim);
            return claim;
        }

        function getOwnershipClaimForToken(token) {
            if (!token || !ownershipClaimsByToken) return null;
            try {
                return ownershipClaimsByToken.get(token) || null;
            } catch (_) {
                return null;
            }
        }

        function getSurfaceWinner(bucket) {
            if (!bucket || !bucket.surfaceClaims) return null;
            let winner = null;
            bucket.surfaceClaims.forEach((claim) => {
                if (!isLiveOwnershipClaim(claim)) return;
                if (!winner || claim.priority > winner.priority || (
                    claim.priority === winner.priority && claim.createdAt < winner.createdAt
                )) {
                    winner = claim;
                }
            });
            return winner;
        }

        function isLiveOwnershipClaim(claim) {
            return !!(claim && claim.active === true && (claim.status === 'claimed' || claim.status === 'provisional'));
        }

        function preemptLowerPriorityClaims(bucket, winner) {
            if (!bucket || !winner) return;
            bucket.surfaceClaims.forEach((claim) => {
                if (claim !== winner
                    && isLiveOwnershipClaim(claim)
                    && claim.adapterId !== winner.adapterId
                    && claim.priority < winner.priority) {
                    revokeOwnershipClaim(claim, 'preempted');
                }
            });
            bucket.textClaims.forEach((claim) => {
                if (isLiveOwnershipClaim(claim)
                    && claim.adapterId !== winner.adapterId
                    && claim.priority < winner.priority) {
                    revokeOwnershipClaim(claim, 'preempted');
                }
            });
        }

        function revokeOwnershipClaim(claim, reason) {
            if (!claim || claim.active !== true) return false;
            claim.active = false;
            claim.status = 'revoked';
            claim.reason = firstString(reason, 'revoked');
            claim.updatedAt = Date.now();
            removeClaimFromBucket(claim);
            return true;
        }

        function releaseOwnershipToken(token, expectedKind, reason) {
            const claim = getOwnershipClaimForToken(token);
            if (!claim || claim.kind !== expectedKind || claim.active !== true) return false;
            claim.active = false;
            claim.status = 'released';
            claim.reason = firstString(reason, 'released');
            claim.updatedAt = Date.now();
            removeClaimFromBucket(claim);
            if (claim.kind === 'text') textClaimsById.delete(claim.id);
            return true;
        }

        function removeClaimFromBucket(claim) {
            const bucket = claim && claim.bucket;
            if (!bucket) return;
            try {
                if (claim.kind === 'surface') bucket.surfaceClaims.delete(claim);
                if (claim.kind === 'text') bucket.textClaims.delete(claim);
            } catch (_) {}
        }

        function findTextOwnershipBlocker(descriptor, ownClaim = null) {
            if (!descriptor || descriptor.adapterId === 'message') return null;
            const glyph = descriptor.standaloneGlyph || descriptor.mode === 'bitmapFallback'
                ? normalizeOwnershipText(descriptor.text)
                : '';
            if (!glyph) return null;
            for (const claim of textClaimsById.values()) {
                if (claim === ownClaim || !isLiveOwnershipClaim(claim)) continue;
                if (claim.mode !== 'messageGlyphSource') continue;
                if (claim.adapterId === descriptor.adapterId) continue;
                if (claim.searchText && claim.searchText.indexOf(glyph) >= 0) {
                    return { reason: 'message-glyph-source', claim };
                }
            }
            return null;
        }

        function validateObservationOwnership(source, eventOptions = {}) {
            const required = eventOptions && eventOptions.ownershipRequired === true;
            const token = eventOptions && (eventOptions.ownershipToken || eventOptions.ownership);
            if (!required && !token) return true;
            const claim = getOwnershipClaimForToken(token);
            if (!claim || claim.kind !== 'text' || claim.active !== true) return false;
            if (claim.adapterId !== firstString(source.sourceAdapter, source.hook, 'text')) return false;
            if (claim.provisional === true) return false;
            const bucket = claim.bucket || getOwnershipBucket(claim.target, false);
            if (!bucket) return true;
            const winner = getSurfaceWinner(bucket);
            return !(winner && winner.adapterId !== claim.adapterId && winner.priority >= claim.priority);
        }

        function createOwnershipDeniedResult(reason, ownerClaim, descriptor = {}) {
            return cloneOwnershipResult('denied', null, ownerClaim, descriptor, reason);
        }

        function cloneOwnershipResult(status, claim, ownerClaim, descriptor = {}, reason = '') {
            return Object.freeze({
                status,
                token: claim && claim.token ? claim.token : null,
                ownershipToken: claim && claim.token ? claim.token : null,
                claimId: claim && claim.id ? claim.id : '',
                ownerAdapter: ownerClaim && ownerClaim.adapterId
                    ? ownerClaim.adapterId
                    : (claim && claim.adapterId ? claim.adapterId : ''),
                ownerClaimId: ownerClaim && ownerClaim.id ? ownerClaim.id : '',
                adapterId: claim && claim.adapterId ? claim.adapterId : firstString(descriptor.adapterId),
                surfaceId: claim && claim.surfaceId ? claim.surfaceId : firstString(descriptor.surfaceId),
                surfaceType: claim && claim.surfaceType ? claim.surfaceType : firstString(descriptor.surfaceType),
                mode: claim && claim.mode ? claim.mode : firstString(descriptor.mode),
                reason: firstString(reason, ownerClaim && ownerClaim.reason),
            });
        }

        function getDefaultOwnershipPriority(adapterId) {
            const key = firstString(adapterId, 'text');
            return Object.prototype.hasOwnProperty.call(OWNERSHIP_PRIORITY, key)
                ? OWNERSHIP_PRIORITY[key]
                : OWNERSHIP_PRIORITY.text;
        }

        function normalizeOwnershipText(text) {
            return String(text ?? '').replace(/\s+/g, '').trim();
        }

        function ownershipNumber(value, fallback) {
            const numeric = finiteNumber(value);
            return numeric === null || numeric === undefined ? fallback : numeric;
        }

        return {
            claimSurface,
            releaseSurface,
            claimText,
            finalizeTextClaim,
            releaseTextClaim,
            normalizeOwnershipDescriptor,
            resolveOwnershipTarget,
            getOwnershipBucket,
            createOwnershipClaim,
            getOwnershipClaimForToken,
            getSurfaceWinner,
            isLiveOwnershipClaim,
            preemptLowerPriorityClaims,
            revokeOwnershipClaim,
            releaseOwnershipToken,
            removeClaimFromBucket,
            findTextOwnershipBlocker,
            validateObservationOwnership,
            createOwnershipDeniedResult,
            cloneOwnershipResult,
            getDefaultOwnershipPriority,
            normalizeOwnershipText,
            ownershipNumber,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorOwnership', { create: createController });
})();
