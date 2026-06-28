// Bitmap text adapter support: copied target materialization.
// Copy lineage is the durable source of truth; invalidation walks stale ledger
// copy edges back to source entries instead of maintaining adapter target maps.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.copiedTargets',
        requires: {
            copiedTargetProofSummary: 'runtime.bitmap.copiedTargetProofSummary',
        },
        factory({ copiedTargetProofSummary }) {

    function createController(scope = {}) {
        const {
            withBitmapReplay,
            getBitmapState,
            drawBitmapTextValue,
        } = scope.controllerFacades.replay;
        const { getEntryStatus, isEntryCompleted, retireEntry, findEntryBySourceRun } = scope.controllerFacades.records;
        const {
            deriveEntryRect,
            isValidRect,
            rectHasArea,
            positiveNumber,
            finiteNumber,
            updateItem,
            stringify,
        } = scope.controllerFacades.textUtils;
        const COPIED_TARGET_PROVIDER_TOKEN = 'bitmap-text';
        let copiedTargetProviderUnregister = null;

        function registerCopiedBitmapTargetProvider() {
            if (copiedTargetProviderUnregister) return true;
            const services = scope.bitmapServices;
            if (!services || typeof services.registerCopiedTargetProvider !== 'function') return false;
            copiedTargetProviderUnregister = services.registerCopiedTargetProvider({
                token: COPIED_TARGET_PROVIDER_TOKEN,
                collectCopiedTargetCandidates: collectCopiedBitmapTargetProviderCandidates,
                drawCopiedTargetCandidate: drawCopiedBitmapTargetProviderCandidate,
            });
            return typeof copiedTargetProviderUnregister === 'function';
        }

        function materializeCopiedBitmapTargetsBeforeMutation(targetBitmap, methodName, mutation = {}) {
            if (!isCopiedBitmapTextMutation(targetBitmap, methodName, mutation)) {
                return materializeExistingCopiedBitmapTargetsBeforeTargetMutation(targetBitmap, methodName, mutation);
            }
            const sourceBitmap = mutation.sourceBitmap || null;
            const sourceRect = cloneValidRect(mutation.sourceRect);
            const targetRect = cloneValidRect(mutation.rect);
            if (!sourceBitmap || sourceBitmap === targetBitmap || !sourceRect || !targetRect) return [];

            const state = getBitmapState(sourceBitmap);
            if (!state || !state.entries || typeof state.entries.forEach !== 'function') return [];

            const materialized = [];
            try {
                state.entries.forEach((entry) => {
                    if (!entry || entry.stale || entry.bitmap !== sourceBitmap) return;
                    if (!isBitmapFallbackEntry(entry)) return;
                    const copiedTarget = materializeCopiedBitmapTargetForEntry(
                        entry,
                        targetBitmap,
                        sourceBitmap,
                        sourceRect,
                        targetRect,
                        methodName,
                        mutation
                    );
                    if (copiedTarget) {
                        materialized.push({
                            entry,
                            target: copiedTarget,
                            projectionRecord: createCopiedBitmapTargetProjectionRecord(entry, copiedTarget),
                        });
                    }
                });
            } catch (error) {
                reportCopiedTargetError('materializeBeforeMutation', error);
            }
            return materialized;
        }

        function materializeExistingCopiedBitmapTargetsBeforeTargetMutation(targetBitmap, methodName, mutation = {}) {
            const targetRect = resolveTargetMutationRect(targetBitmap, mutation);
            if (!targetBitmap || !targetRect) return [];
            if (isSupersedingTargetContentMutation(targetBitmap, methodName, mutation, targetRect)) return [];
            const services = scope.bitmapServices;
            if (!services || typeof services.collectCopiedTargetRestoreSeeds !== 'function') return [];
            const seeds = services.collectCopiedTargetRestoreSeeds({
                providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                targetBitmap,
                restoreRect: targetRect,
                mutationMethodName: mutation && mutation.methodName || '',
                reason: 'bitmap-target-mutation',
            });
            return seeds.map((candidate) => ({ candidate }));
        }

        function isSupersedingTargetContentMutation(targetBitmap, methodName, mutation = {}, targetRect = null) {
            if (mutation && (mutation.destroyed === true || mutation.newGeneration === true || mutation.full === true)) return true;
            const method = stringify(methodName || mutation && mutation.methodName || '');
            if (method === 'destroy' || method === 'resize') return true;
            if (method !== 'clear' && method !== 'clearRect') return false;
            return mutationCoversWholeBitmap(targetBitmap, targetRect);
        }

        function mutationCoversWholeBitmap(bitmap, rect) {
            if (!bitmap || !rectHasArea(rect)) return false;
            const width = Number(bitmap.width);
            const height = Number(bitmap.height);
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
            return Number(rect.x1) <= 0
                && Number(rect.y1) <= 0
                && Number(rect.x2) >= width
                && Number(rect.y2) >= height;
        }

        function redrawMaterializedCopiedBitmapTargetsAfterMutation(targetBitmap, methodName, mutation = {}, materialized = []) {
            if (!Array.isArray(materialized) || !materialized.length) return { committed: 0, redrawn: 0 };
            let committed = 0;
            const seedCandidates = [];
            materialized.forEach((item) => {
                if (item && item.candidate) {
                    if (item.candidate.targetBitmap !== targetBitmap) return;
                    committed += 1;
                    seedCandidates.push(item.candidate);
                    return;
                }
                const entry = item && item.entry;
                const target = item && item.target;
                if (!entry || entry.stale || !isPreparedCopiedBitmapTarget(targetBitmap, target)) return;
                const display = resolveCopiedBitmapEntryDisplay(entry);
                const candidate = createCopiedBitmapTargetCandidate(entry, target, display.text, {
                    seed: true,
                    displayTextSource: display.source,
                });
                if (!candidate) return;
                committed += 1;
                seedCandidates.push(candidate);
            });
            const compositionProofs = [];
            const redrawn = redrawCopiedBitmapRestoreCandidates(seedCandidates, {
                reason: 'bitmap-copy-target-redraw',
                compositionProofs,
            });
            const proof = copiedTargetProofSummary.createCopiedTargetProofSummary(compositionProofs, redrawn);
            recordMaterializedCopiedTargetRedrawProof(materialized, proof, {
                committed,
                redrawn,
                reason: 'bitmap-copy-target-redraw',
            });
            return { committed, redrawn, proof };
        }

        function invalidateCopiedBitmapTargetsForMutation(targetBitmap, rect = null, reason = 'bitmap-mutation') {
            if (!targetBitmap) return 0;
            const entries = collectBitmapEntriesForInvalidatedCopyEdges(targetBitmap, rect);
            if (!entries.size) return 0;
            let removed = 0;
            Array.from(entries).forEach((entry) => {
                if (!entry || entry.stale) return;
                removed += 1;
                retireDetachedCopiedBitmapEntry(entry, reason);
            });
            return removed;
        }

        function collectBitmapEntriesForInvalidatedCopyEdges(targetBitmap, rect = null) {
            const entries = new Set();
            const edges = getInvalidatedCopyEdgesToBitmap(targetBitmap, rect);
            if (!edges.length) return entries;
            const services = scope.bitmapServices;
            edges.forEach((edge) => {
                const sourceBitmap = resolveCopyEdgeSourceBitmap(services, edge);
                forEachCopiedEdgeCandidateEntry(sourceBitmap, (entry) => {
                    if (isEntryInvalidatedByCopyEdge(entry, edge, sourceBitmap)) entries.add(entry);
                });
            });
            return entries;
        }

        function forEachCopiedEdgeCandidateEntry(sourceBitmap, callback) {
            if (typeof callback !== 'function') return;
            const visited = new Set();
            const visit = (entry) => {
                if (!entry || visited.has(entry)) return;
                visited.add(entry);
                callback(entry);
            };
            const state = sourceBitmap ? getBitmapState(sourceBitmap) : null;
            if (state && state.entries && typeof state.entries.forEach === 'function') {
                try {
                    state.entries.forEach(visit);
                } catch (error) {
                    reportCopiedTargetError('collectStateEntries', error);
                }
            }
            if (scope.entriesByItemId && typeof scope.entriesByItemId.forEach === 'function') {
                try {
                    scope.entriesByItemId.forEach(visit);
                } catch (error) {
                    reportCopiedTargetError('collectRecordEntries', error);
                }
            }
        }

        function getInvalidatedCopyEdgesToBitmap(targetBitmap, rect = null) {
            const services = scope.bitmapServices;
            if (!targetBitmap || !services
                || typeof services.getInvalidatedCopyEdgesTo !== 'function') {
                return [];
            }
            let edges = [];
            try {
                edges = services.getInvalidatedCopyEdgesTo(targetBitmap, { targetRect: rect });
            } catch (error) {
                reportCopiedTargetError('getInvalidatedCopyEdgesTo', error);
                edges = [];
            }
            if (!Array.isArray(edges) || !edges.length) return [];
            return edges.filter((edge) => !!(edge && edge.sourceSurfaceId));
        }

        function resolveCopyEdgeSourceBitmap(services, edge) {
            if (!services || typeof services.getSurfaceById !== 'function' || !edge || !edge.sourceSurfaceId) return null;
            try {
                return services.getSurfaceById(edge.sourceSurfaceId) || null;
            } catch (error) {
                reportCopiedTargetError('resolveSourceBitmap', error);
                return null;
            }
        }

        function isEntryInvalidatedByCopyEdge(entry, edge, sourceBitmap) {
            if (!entry || entry.stale || !isBitmapFallbackEntry(entry)) return false;
            if (sourceBitmap && entry.bitmap && entry.bitmap !== sourceBitmap) return false;
            const sourceRun = createCopiedSourceTextRun(entry);
            if (!sourceRun) return false;
            if (sourceRun.surfaceId && edge.sourceSurfaceId && sourceRun.surfaceId !== edge.sourceSurfaceId) return false;
            if (!isSourceRunCurrentForCopyEdge(sourceRun, edge)) return false;
            const sourceRect = cloneValidRect(edge.sourceRect);
            const sourceBounds = cloneValidRect(sourceRun.bounds);
            return rectContainsRect(sourceRect, sourceBounds);
        }

        function isSourceRunCurrentForCopyEdge(sourceRun, edge) {
            const runRevision = Number(sourceRun && sourceRun.revision);
            const edgeRevision = Number(edge && edge.sourceRevision);
            if (!Number.isFinite(runRevision) || !Number.isFinite(edgeRevision)) return true;
            return runRevision <= edgeRevision;
        }

        function redrawCopiedBitmapTargets(entry, translatedText = '', options = {}) {
            if (!entry) return 0;
            const display = resolveCopiedBitmapEntryDisplay(entry, translatedText);
            if (!display.text) return 0;
            const materializedTargets = Array.isArray(options && options.materializedTargets)
                ? options.materializedTargets.filter(isUsableCopiedBitmapTarget)
                : [];
            const targets = materializedTargets.length
                ? materializedTargets
                : materializeCopiedBitmapTargetsFromLedger(entry);
            if (!targets.length) return 0;
            recordCopiedBitmapTargetProjectionPayload(entry, targets, display);
            const seedCandidates = targets
                .map((target) => createCopiedBitmapTargetCandidate(entry, target, display.text, {
                    seed: true,
                    displayTextSource: display.source,
                }))
                .filter(Boolean);
            return redrawCopiedBitmapRestoreCandidates(seedCandidates, {
                reason: 'bitmap-copy-target-redraw',
                compositionProofs: options && options.compositionProofs,
            });
        }

        function materializeCopiedBitmapTargetRedraws(entry) {
            return materializeCopiedBitmapTargetsFromLedger(entry);
        }

        function recordCopiedBitmapTargetProjectionPayload(entry, targets, display) {
            const services = scope.bitmapServices;
            if (!services || typeof services.recordCopiedTextTargetPayload !== 'function') return null;
            try {
                return services.recordCopiedTextTargetPayload({
                    providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                    sourceAdapter: 'bitmap-text',
                    entry,
                    entryId: createCopiedBitmapTargetEntryKey(entry),
                    displayText: display && display.text || '',
                    displayTextSource: display && display.source || '',
                    sourceText: resolveNativeCopiedBitmapEntryText(entry),
                    targets,
                });
            } catch (error) {
                reportCopiedTargetError('recordProjectionPayload', error);
                return null;
            }
        }

        function materializeCopiedBitmapTargetsFromLedger(entry) {
            const services = scope.bitmapServices;
            if (!entry || !services || typeof services.getCopiedTextTargetMaterializations !== 'function') return [];
            const sourceBitmap = entry.bitmap || null;
            if (!sourceBitmap) return [];
            const textRun = createCopiedSourceTextRun(entry);
            if (!textRun) return [];
            let materialized = [];
            try {
                materialized = services.getCopiedTextTargetMaterializations(sourceBitmap, {
                    runId: textRun.runId,
                    slotKey: textRun.slotKey,
                    textRun,
                    drawGeometry: entry.drawParams || null,
                    drawState: entry.drawState || null,
                });
            } catch (error) {
                reportCopiedTargetError('materializeLedger', error);
                materialized = [];
            }
            if (!Array.isArray(materialized) || !materialized.length) return [];
            return materialized
                .map((target) => createCopiedBitmapTargetFromMaterialization(entry, target, target && target.methodName || 'ledger-copy'))
                .filter(Boolean);
        }

        function hasMaterializedCopiedBitmapTargetProof(entry) {
            return materializeCopiedBitmapTargetsFromLedger(entry).length > 0;
        }

        function retireDetachedCopiedBitmapEntry(entry, reason = 'bitmap-mutation') {
            if (!entry || entry.stale || !isCopiedTargetDetachedEntry(entry)) return false;
            if (hasMaterializedCopiedBitmapTargetProof(entry)) return false;
            try {
                return retireEntry(entry, `${reason || 'bitmap-mutation'}-copied-target-invalidated`, 'stale') === true;
            } catch (error) {
                reportCopiedTargetError('retireDetached', error);
                return false;
            }
        }

        function isCopiedTargetDetachedEntry(entry) {
            const lifecycle = entry && entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                ? entry.renderLifecycle
                : null;
            const detachment = lifecycle && lifecycle.copiedTargetDetachment && typeof lifecycle.copiedTargetDetachment === 'object'
                ? lifecycle.copiedTargetDetachment
                : null;
            return !!(detachment && detachment.detached === true);
        }

        function isCopiedBitmapTextMutation(targetBitmap, methodName, mutation) {
            const method = String(methodName || '');
            return !!(targetBitmap
                && (method === 'blt' || method === 'bltImage')
                && mutation
                && mutation.sourceBitmap
                && mutation.sourceRect
                && mutation.rect);
        }

        function isBitmapFallbackEntry(entry) {
            // Bitmap fallback owns entries by adapter state, not by the game
            // object's constructor name. Window-owned contents can still reach
            // this adapter when no more-specific text path claimed the draw.
            return !!(entry && !entry.ownerWindow);
        }

        function resolveTargetMutationRect(targetBitmap, mutation = {}) {
            const rect = cloneValidRect(mutation && (mutation.rect || mutation.targetRect));
            if (rect) return rect;
            if (!(mutation && mutation.full === true) || !isUsableBitmap(targetBitmap)) return null;
            return {
                x1: 0,
                y1: 0,
                x2: Number(targetBitmap.width),
                y2: Number(targetBitmap.height),
            };
        }

        function materializeCopiedBitmapTargetForEntry(entry, targetBitmap, sourceBitmap, sourceRect, targetRect, methodName, mutation = null) {
            const services = scope.bitmapServices;
            if (!services || typeof services.getPendingCopiedTextTargetMaterializations !== 'function') return null;
            const textRun = createCopiedSourceTextRun(entry);
            if (!textRun) return null;
            const materialized = services.getPendingCopiedTextTargetMaterializations(sourceBitmap, {
                targetBitmap,
                textRun,
                sourceRect,
                targetRect,
                targetRestoreMaterialId: mutation && mutation.targetRestoreMaterialId || '',
                targetRestoreRect: mutation && mutation.targetRestoreRect || null,
                targetRestoreRevisionBefore: mutation && mutation.targetRestoreRevisionBefore,
                drawGeometry: entry.drawParams || null,
                drawState: entry.drawState || null,
            });
            const target = Array.isArray(materialized) && materialized.length ? materialized[0] : null;
            return createCopiedBitmapTargetFromMaterialization(entry, target, methodName);
        }

        function redrawCopiedBitmapRestoreCandidates(seedCandidates, options = {}) {
            const services = scope.bitmapServices;
            if (!services || typeof services.redrawCopiedTargetRestoreComposition !== 'function') return 0;
            return services.redrawCopiedTargetRestoreComposition({
                providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                seedCandidates,
                reason: options && options.reason || 'bitmap-copy-target-redraw',
                compositionProofs: options && options.compositionProofs,
            }) || 0;
        }

        function recordMaterializedCopiedTargetRedrawProof(materialized, proof, input = {}) {
            if (!proof || !(input && input.redrawn > 0)) return 0;
            if (typeof updateItem !== 'function') return 0;
            const seen = new Set();
            let updated = 0;
            (Array.isArray(materialized) ? materialized : []).forEach((item) => {
                const entry = item && item.entry || item && item.candidate && item.candidate.entry || null;
                const recordId = stringify(entry && entry.recordId || '');
                if (!entry || !recordId || seen.has(recordId)) return;
                seen.add(recordId);
                try {
                    const result = updateItem(entry, {
                        metadata: {
                            copiedTargetProof: proof,
                            copiedTargetRedraws: input.redrawn,
                        },
                    }, 'item.copied_target_redrawn', {
                        reason: input.reason || 'bitmap-copy-target-redraw',
                        copiedTargets: input.redrawn,
                        copiedTargetRedraws: input.redrawn,
                        committedCopiedTargets: input.committed || 0,
                        copiedTargetProof: proof,
                    });
                    if (result) updated += 1;
                } catch (error) {
                    reportCopiedTargetError('recordRedrawProof', error);
                }
            });
            return updated;
        }

        function collectCopiedBitmapTargetProviderCandidates(request = {}) {
            const candidates = [];
            const projected = collectProjectedCopiedBitmapTargetProviderCandidates(request);
            if (Array.isArray(projected)) {
                projected.forEach((candidate) => {
                    if (candidate) candidates.push(candidate);
                });
            }
            collectLiveCopiedBitmapTargetProviderCandidates().forEach((candidate) => {
                if (candidate) candidates.push(candidate);
            });
            return dedupeCopiedBitmapTargetCandidates(candidates);
        }

        function collectLiveCopiedBitmapTargetProviderCandidates() {
            const candidates = [];
            forEachCopiedEdgeCandidateEntry(null, (entry) => {
                if (!entry || entry.stale || !isBitmapFallbackEntry(entry)) return;
                const display = resolveCopiedBitmapEntryDisplay(entry);
                if (!display.text) return;
                materializeCopiedBitmapTargetsFromLedger(entry).forEach((target) => {
                    const candidate = createCopiedBitmapTargetCandidate(entry, target, display.text, {
                        displayTextSource: display.source,
                    });
                    if (candidate) candidates.push(candidate);
                });
            });
            return candidates;
        }

        function dedupeCopiedBitmapTargetCandidates(candidates) {
            const result = [];
            const seen = new Set();
            (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
                if (!candidate) return;
                const key = createCopiedBitmapTargetCandidateKey(candidate);
                if (seen.has(key)) return;
                seen.add(key);
                result.push(candidate);
            });
            return result;
        }

        function createCopiedBitmapTargetCandidateKey(candidate) {
            const target = candidate && candidate.target && typeof candidate.target === 'object'
                ? candidate.target
                : candidate;
            const sourceRunId = stringify(candidate && candidate.sourceRunId || target && target.sourceRunId || '');
            const sourceSlotKey = stringify(candidate && candidate.sourceSlotKey || target && target.sourceSlotKey || '');
            const edgeId = stringify(candidate && candidate.edgeId || target && target.edgeId || '');
            const targetSurfaceId = stringify(candidate && candidate.targetSurfaceId || target && target.targetSurfaceId || '');
            const targetBoundsKey = rectKey(candidate && (candidate.targetBounds || candidate.bounds) || target && (target.bounds || target.targetBounds));
            if ((sourceRunId || sourceSlotKey) && (edgeId || targetSurfaceId || targetBoundsKey)) {
                return [
                    stringify(candidate && candidate.providerToken || ''),
                    stringify(candidate && candidate.sourceSurfaceId || target && target.sourceSurfaceId || ''),
                    sourceRunId,
                    sourceSlotKey,
                    edgeId,
                    targetSurfaceId,
                    targetBoundsKey,
                ].join('|');
            }
            return [
                stringify(candidate && candidate.providerToken || ''),
                stringify(candidate && candidate.entryId || ''),
            ].join('|');
        }

        function collectProjectedCopiedBitmapTargetProviderCandidates(request = {}) {
            const targetBitmap = request && request.targetBitmap || null;
            if (!targetBitmap) return null;
            const services = scope.bitmapServices;
            if (!services || typeof services.getProjectedTextRunsForTarget !== 'function') return null;
            const projectedRuns = services.getProjectedTextRunsForTarget(targetBitmap, {
                targetRect: request.restoreRect || request.targetRect || request.rect || null,
            });
            if (!Array.isArray(projectedRuns)) return [];
            const candidates = [];
            projectedRuns.forEach((projection) => {
                if (isProjectionForOtherCopiedTargetProvider(projection)) return;
                const projectedCandidate = createProjectedCopiedBitmapTargetCandidate(projection, targetBitmap, request);
                if (projectedCandidate) {
                    candidates.push(projectedCandidate);
                    return;
                }
                const entry = findBitmapEntryForProjectedTextRun(projection);
                if (!entry) return;
                if (entry.stale || !isBitmapFallbackEntry(entry)) return;
                const display = resolveCopiedBitmapEntryDisplay(entry);
                if (!display.text) return;
                materializeCopiedBitmapTargetsFromLedger(entry).forEach((target) => {
                    if (!isProjectedBitmapTarget(projection, target, targetBitmap)) return;
                    const candidate = createCopiedBitmapTargetCandidate(entry, target, display.text, {
                        displayTextSource: display.source,
                    });
                    if (candidate) candidates.push(candidate);
                });
            });
            return candidates;
        }

        function createProjectedCopiedBitmapTargetCandidate(projection, targetBitmap, request = {}) {
            if (!hasBitmapProjectionOwnership(projection)) return null;
            const display = resolveCopiedBitmapProjectionDisplay(projection);
            if (!display.text) {
                recordProjectionSkip(request, projection, 'missing-display-text');
                return null;
            }
            const target = createCopiedBitmapTargetFromProjection(projection, targetBitmap);
            if (!target) {
                recordProjectionSkip(request, projection, 'missing-target-replay-data');
                return null;
            }
            const candidate = createCopiedBitmapTargetCandidate(null, target, display.text, {
                projectionOwned: true,
                entryId: createProjectedCopiedBitmapTargetEntryKey(projection, target),
                sourceDrawOrder: Number(getProjectionValue(projection, 'sourceDrawOrder')) || 0,
                displayTextSource: display.source,
            });
            if (!candidate) {
                recordProjectionSkip(request, projection, 'invalid-projected-candidate');
                return null;
            }
            return candidate;
        }

        function isProjectionForOtherCopiedTargetProvider(projection) {
            const providerToken = stringify(getProjectionValue(projection, 'providerToken') || '');
            const sourceAdapter = stringify(getProjectionValue(projection, 'sourceAdapter') || '');
            return !!((providerToken && providerToken !== COPIED_TARGET_PROVIDER_TOKEN)
                || (sourceAdapter && sourceAdapter !== 'bitmap-text'));
        }

        function hasBitmapProjectionOwnership(projection) {
            const providerToken = stringify(getProjectionValue(projection, 'providerToken') || '');
            const sourceAdapter = stringify(getProjectionValue(projection, 'sourceAdapter') || '');
            return providerToken === COPIED_TARGET_PROVIDER_TOKEN || sourceAdapter === 'bitmap-text';
        }

        function getProjectionValue(projection, key) {
            if (!projection || !key) return undefined;
            if (projection[key] !== undefined) return projection[key];
            const record = projection.projectionRecord && typeof projection.projectionRecord === 'object'
                ? projection.projectionRecord
                : null;
            if (record && record[key] !== undefined) return record[key];
            return undefined;
        }

        function createProjectedCopiedBitmapTargetEntryKey(projection, target) {
            const explicit = stringify(getProjectionValue(projection, 'entryId') || '');
            if (explicit) return explicit;
            return [
                stringify(getProjectionValue(projection, 'sourceSlotKey') || target && target.sourceSlotKey || ''),
                stringify(getProjectionValue(projection, 'sourceRunId') || target && target.sourceRunId || ''),
                stringify(target && target.edgeId || getProjectionValue(projection, 'edgeId') || ''),
                rectKey(target && target.bounds || getProjectionValue(projection, 'targetBounds')),
            ].join('|');
        }

        function recordProjectionSkip(request, projection, reason) {
            const skipReason = stringify(reason || 'projection-not-replayable');
            if (projection && typeof projection === 'object') {
                projection.skipReason = skipReason;
                projection.copiedTargetSkipReason = skipReason;
            }
            const skipped = request && (request.skippedCandidates || request.skippedProjections);
            if (Array.isArray(skipped)) {
                skipped.push({
                    providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                    reason: skipReason,
                    entryId: stringify(getProjectionValue(projection, 'entryId') || ''),
                    edgeId: stringify(getProjectionValue(projection, 'edgeId') || ''),
                    targetSurfaceId: stringify(getProjectionValue(projection, 'targetSurfaceId') || ''),
                    targetBounds: cloneValidRect(getProjectionValue(projection, 'targetBounds') || projection && projection.bounds || null),
                });
            }
        }

        function findBitmapEntryForProjectedTextRun(projection) {
            if (!projection) return null;
            const services = scope.bitmapServices;
            const sourceBitmap = projection.sourceBitmap
                || resolveCopyEdgeSourceBitmap(services, projection)
                || null;
            const entry = typeof findEntryBySourceRun === 'function'
                ? findEntryBySourceRun({ projection, sourceBitmap })
                : null;
            return isBitmapEntryForProjectedTextRun(entry, projection, sourceBitmap) ? entry : null;
        }

        function isBitmapEntryForProjectedTextRun(entry, projection, sourceBitmap) {
            if (!entry || entry.stale || !projection) return false;
            if (sourceBitmap && entry.bitmap && entry.bitmap !== sourceBitmap) return false;
            const sourceRun = createCopiedSourceTextRun(entry);
            if (!sourceRun) return false;
            const surfaceId = stringify(projection.sourceSurfaceId || projection.sourceTextRun && projection.sourceTextRun.surfaceId || '');
            if (surfaceId && sourceRun.surfaceId && sourceRun.surfaceId !== surfaceId) return false;
            const runId = stringify(projection.sourceRunId || projection.sourceTextRun && projection.sourceTextRun.runId || '');
            if (runId && sourceRun.runId) {
                if (sourceRun.runId === runId) return true;
                if (!isProjectionForBitmapEntry(projection, entry)) return false;
            }
            const slotKey = stringify(projection.sourceSlotKey || projection.sourceTextRun && projection.sourceTextRun.slotKey || '');
            return !!(slotKey && sourceRun.slotKey && sourceRun.slotKey === slotKey);
        }

        function isProjectionForBitmapEntry(projection, entry) {
            const projectedEntryId = stringify(getProjectionValue(projection, 'entryId') || '');
            return !!(projectedEntryId && projectedEntryId === createCopiedBitmapTargetEntryKey(entry));
        }

        // Copied-target restoration needs a display payload even when the
        // source entry was intentionally not translated, such as a counter.
        // Keep that separate from translation completion so skipped native text
        // can be redrawn only when copy lineage proves it belongs on a target.
        function resolveCopiedBitmapEntryDisplay(entry, preferredText = '') {
            const preferred = stringify(preferredText || '');
            if (preferred) return { text: preferred, source: 'provided' };
            if (!entry || entry.stale) return { text: '', source: '' };
            const translated = isEntryCompleted(entry) && entry.renderedText
                ? stringify(entry.renderedText || '')
                : '';
            if (translated) return { text: translated, source: 'translated' };
            const nativeText = resolveNativeCopiedBitmapEntryText(entry);
            if (!nativeText || !shouldPreserveNativeCopiedBitmapEntry(entry)) return { text: '', source: '' };
            return { text: nativeText, source: 'native' };
        }

        function resolveCopiedBitmapProjectionDisplay(projection) {
            const rendered = stringify(getProjectionValue(projection, 'renderedText') || '');
            if (rendered) return { text: rendered, source: 'translated' };
            const displaySource = stringify(getProjectionValue(projection, 'displayTextSource') || '');
            const display = stringify(getProjectionValue(projection, 'displayText') || '');
            if (display) {
                return {
                    text: display,
                    source: displaySource || 'native',
                };
            }
            if (displaySource !== 'native') return { text: '', source: '' };
            const sourceText = stringify(getProjectionValue(projection, 'sourceText') || '');
            if (sourceText) return { text: sourceText, source: 'native' };
            const sourceRun = projection && projection.sourceTextRun && typeof projection.sourceTextRun === 'object'
                ? projection.sourceTextRun
                : null;
            const nativeText = stringify(sourceRun && (sourceRun.visibleText || sourceRun.text) || '');
            if (!nativeText) return { text: '', source: '' };
            return { text: nativeText, source: 'native' };
        }

        function resolveNativeCopiedBitmapEntryText(entry) {
            return stringify(entry && (
                entry.visibleText
                || entry.rawText
                || entry.translationSource
                || entry.normalizedSource
                || ''
            ) || '');
        }

        function shouldPreserveNativeCopiedBitmapEntry(entry) {
            if (!entry || entry.stale) return false;
            const status = typeof getEntryStatus === 'function'
                ? stringify(getEntryStatus(entry, ''))
                : stringify(entry.status || '');
            return !!(entry.skipReason
                || status === 'skipped'
                || status === 'failed'
                || status === 'terminal');
        }

        function isProjectedBitmapTarget(projection, target, targetBitmap) {
            if (!projection || !isPreparedCopiedBitmapTarget(targetBitmap, target)) return false;
            const edgeId = stringify(projection.edgeId || '');
            if (edgeId && stringify(target.edgeId || '') !== edgeId) return false;
            const targetSurfaceId = stringify(projection.targetSurfaceId || '');
            if (targetSurfaceId && stringify(target.targetSurfaceId || '') !== targetSurfaceId) return false;
            return true;
        }

        function drawCopiedBitmapTargetProviderCandidate(candidate) {
            if (!candidate) return false;
            const targetBitmap = candidate.target && candidate.target.targetBitmap;
            if (!targetBitmap) return false;
            let accepted = false;
            // The shared restore compositor decides which copied targets belong in
            // the restored target region. Bitmap fallback still owns the actual
            // draw operation, so the draw must remain inside the bitmap replay
            // guard. Without that guard, the adapter's drawText hook observes its
            // own maintenance redraw as a new game-authored bitmap text run.
            withBitmapReplay(targetBitmap, () => {
                accepted = drawCopiedBitmapTarget(candidate.entry, candidate.target, candidate.renderedText);
            }, 'bitmap-copy-target-redraw');
            return accepted;
        }

        function createCopiedBitmapTargetCandidate(entry, target, renderedText, options = {}) {
            const projectionOwned = options && options.projectionOwned === true;
            if ((!entry && !projectionOwned) || !isUsableCopiedBitmapTarget(target)) return null;
            const rendered = stringify(renderedText || entry && entry.renderedText || '');
            if (!rendered) return null;
            const sourceDrawOrder = entry
                ? (entry.drawOrder || 0)
                : (Number(options && options.sourceDrawOrder) || Number(target.sourceDrawOrder) || 0);
            return {
                providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                entryId: stringify(options && options.entryId || createCopiedBitmapTargetEntryKey(entry)),
                entry,
                target,
                renderedText: rendered,
                targetBitmap: target.targetBitmap,
                targetSurfaceId: target.targetSurfaceId,
                targetBounds: target.bounds,
                targetRestoreMaterial: target.targetRestoreMaterial,
                edgeId: target.edgeId,
                targetRevision: target.targetRevision,
                targetRestoreRevisionBefore: target.targetRestoreMaterial && target.targetRestoreMaterial.targetRevisionBefore,
                sourceSurfaceId: stringify(target.sourceSurfaceId || ''),
                sourceRunId: stringify(target.sourceRunId || ''),
                sourceSlotKey: stringify(target.sourceSlotKey || ''),
                displayText: rendered,
                displayTextSource: stringify(options && options.displayTextSource || ''),
                sourceDrawOrder,
                seed: options && options.seed === true,
                projectionOwned,
            };
        }

        function createCopiedBitmapTargetProjectionRecord(entry, target) {
            if (!entry || !isUsableCopiedBitmapTarget(target)) return null;
            const rendered = stringify(entry.renderedText || '');
            const display = resolveCopiedBitmapEntryDisplay(entry);
            return {
                providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                sourceAdapter: 'bitmap-text',
                entryId: createCopiedBitmapTargetEntryKey(entry),
                sourceSurfaceId: stringify(target.sourceSurfaceId || entry.sourceSurfaceId || ''),
                sourceRunId: stringify(target.sourceRunId || entry.sourceRunId || ''),
                sourceSlotKey: stringify(target.sourceSlotKey || entry.sourceSlotKey || ''),
                sourceBounds: cloneValidRect(target.sourceBounds || deriveEntryRect(entry)),
                targetSurfaceId: stringify(target.targetSurfaceId || ''),
                targetBounds: cloneValidRect(target.bounds || null),
                renderedText: rendered,
                displayText: display.text,
                displayTextSource: display.source,
                sourceText: resolveNativeCopiedBitmapEntryText(entry),
                drawGeometry: target.drawParams && typeof target.drawParams === 'object'
                    ? Object.assign({}, target.drawParams)
                    : null,
                drawState: target.drawState && typeof target.drawState === 'object'
                    ? Object.assign({}, target.drawState)
                    : (entry.drawState && typeof entry.drawState === 'object' ? Object.assign({}, entry.drawState) : null),
                sourceDrawOrder: Number(entry.drawOrder) || 0,
                methodName: resolveCopiedBitmapTextMethodName(entry.methodName || target.methodName),
            };
        }

        function createCopiedBitmapTargetEntryKey(entry) {
            if (!entry) return '';
            const explicit = String(entry.recordId || entry.itemId || entry.id || entry.key || '');
            if (explicit) return explicit;
            return [
                String(entry.sourceSlotKey || ''),
                String(entry.rawText || entry.visibleText || ''),
                String(Number(entry.drawOrder) || 0),
                rectKey(deriveEntryRect(entry)),
            ].join('|');
        }

        function createCopiedSourceTextRun(entry) {
            if (!entry) return null;
            const bounds = cloneValidRect(deriveEntryRect(entry));
            if (!rectHasArea(bounds)) return null;
            return {
                runId: entry.sourceRunId || entry.drawBoundary && entry.drawBoundary.runId || '',
                surfaceId: entry.sourceSurfaceId || entry.drawBoundary && entry.drawBoundary.surfaceId || '',
                revision: Number(entry.sourceSurfaceRevision || entry.drawBoundary && entry.drawBoundary.surfaceRevision) || 0,
                slotKey: entry.sourceSlotKey || entry.drawBoundary && entry.drawBoundary.slotKey || '',
                text: stringify(entry.rawText || ''),
                visibleText: stringify(entry.visibleText || entry.rawText || ''),
                bounds,
                drawState: entry.drawState || null,
                sourceCommitted: entry.sourceCommitted === true || !!entry.skipReason || isEntryCompleted(entry),
            };
        }

        function createCopiedBitmapTargetFromMaterialization(entry, materialized, methodName) {
            if (!entry || !materialized || !isUsableBitmap(materialized.targetBitmap)) return null;
            const sourceRect = cloneValidRect(materialized.sourceRect);
            const targetRect = cloneValidRect(materialized.targetRect);
            const sourceBounds = cloneValidRect(materialized.sourceBounds);
            const bounds = cloneValidRect(materialized.bounds || materialized.targetBounds);
            const drawParams = materialized.drawParams || materialized.drawGeometry || {};
            if (!rectHasArea(sourceRect) || !rectHasArea(targetRect) || !rectHasArea(sourceBounds) || !rectHasArea(bounds)) return null;
            const targetRestoreMaterial = normalizeCopiedTargetRestoreMaterial(
                materialized.targetRestoreMaterial,
                materialized.targetBitmap,
                bounds
            );
            if (!targetRestoreMaterial) return null;
            return {
                edgeId: stringify(materialized.edgeId || ''),
                sourceRunId: stringify(materialized.sourceRunId || ''),
                sourceSlotKey: stringify(materialized.sourceSlotKey || ''),
                sourceSurfaceId: stringify(materialized.sourceSurfaceId || ''),
                targetSurfaceId: stringify(materialized.targetSurfaceId || ''),
                targetRevision: Number(materialized.targetRevision) || 0,
                targetBitmap: materialized.targetBitmap,
                sourceBitmap: materialized.sourceBitmap || entry.bitmap || null,
                sourceRect,
                targetRect,
                sourceBounds,
                bounds,
                drawParams: {
                    x: finiteNumber(drawParams.x, NaN),
                    y: finiteNumber(drawParams.y, NaN),
                    maxWidth: drawParams.maxWidth,
                    lineHeight: drawParams.lineHeight,
                    align: drawParams.align,
                },
                drawState: materialized.drawState && typeof materialized.drawState === 'object'
                    ? Object.assign({}, materialized.drawState)
                    : (entry.drawState && typeof entry.drawState === 'object' ? Object.assign({}, entry.drawState) : null),
                targetRestoreMaterial,
                methodName: resolveCopiedBitmapTextMethodName(entry.methodName || materialized.methodName || methodName),
                createdAt: Date.now(),
            };
        }

        function createCopiedBitmapTargetFromProjection(projection, targetBitmap) {
            const materialized = projection && projection.materialization && typeof projection.materialization === 'object'
                ? projection.materialization
                : (projection && projection.target && typeof projection.target === 'object'
                    ? projection.target
                    : projection);
            const resolvedTargetBitmap = materialized && materialized.targetBitmap
                || projection && projection.targetBitmap
                || targetBitmap
                || null;
            if (resolvedTargetBitmap !== targetBitmap || !isUsableBitmap(resolvedTargetBitmap)) return null;
            const bounds = cloneValidRect(
                getProjectionValue(projection, 'targetBounds')
                || materialized && (materialized.bounds || materialized.targetBounds)
                || projection && projection.bounds
                || null
            );
            const drawParams = getProjectionValue(projection, 'drawGeometry')
                || materialized && (materialized.drawParams || materialized.drawGeometry)
                || {};
            if (!rectHasArea(bounds) || !drawParams) return null;
            const targetRestoreMaterial = normalizeCopiedTargetRestoreMaterial(
                materialized && materialized.targetRestoreMaterial || projection && projection.targetRestoreMaterial,
                resolvedTargetBitmap,
                bounds
            );
            if (!targetRestoreMaterial) return null;
            return {
                edgeId: stringify(getProjectionValue(projection, 'edgeId') || materialized && materialized.edgeId || ''),
                sourceRunId: stringify(getProjectionValue(projection, 'sourceRunId') || materialized && materialized.sourceRunId || ''),
                sourceSlotKey: stringify(getProjectionValue(projection, 'sourceSlotKey') || materialized && materialized.sourceSlotKey || ''),
                sourceSurfaceId: stringify(getProjectionValue(projection, 'sourceSurfaceId') || materialized && materialized.sourceSurfaceId || ''),
                targetSurfaceId: stringify(getProjectionValue(projection, 'targetSurfaceId') || materialized && materialized.targetSurfaceId || ''),
                targetRevision: Number(getProjectionValue(projection, 'targetRevision') || materialized && materialized.targetRevision) || 0,
                targetBitmap: resolvedTargetBitmap,
                sourceBitmap: materialized && materialized.sourceBitmap || projection && projection.sourceBitmap || null,
                sourceRect: cloneValidRect(materialized && materialized.sourceRect || projection && projection.sourceRect || null),
                targetRect: cloneValidRect(materialized && materialized.targetRect || projection && projection.targetRect || null),
                sourceBounds: cloneValidRect(getProjectionValue(projection, 'sourceBounds') || materialized && materialized.sourceBounds || null),
                bounds,
                drawParams: {
                    x: finiteNumber(drawParams.x, NaN),
                    y: finiteNumber(drawParams.y, NaN),
                    maxWidth: drawParams.maxWidth,
                    lineHeight: drawParams.lineHeight,
                    align: drawParams.align,
                },
                drawState: getProjectionValue(projection, 'drawState')
                    || materialized && materialized.drawState
                    || null,
                sourceDrawOrder: Number(getProjectionValue(projection, 'sourceDrawOrder')) || 0,
                targetRestoreMaterial,
                methodName: resolveCopiedBitmapTextMethodName(getProjectionValue(projection, 'methodName') || materialized && materialized.methodName),
                projectionRecord: projection && projection.projectionRecord || null,
                createdAt: Date.now(),
            };
        }

        function resolveCopiedBitmapTextMethodName(methodName) {
            const normalized = stringify(methodName || '');
            if (!normalized || normalized === 'blt' || normalized === 'bltImage') return 'drawText';
            return normalized;
        }

        function normalizeCopiedTargetRestoreMaterial(material, targetBitmap, targetBounds) {
            if (!material || material.targetBitmap !== targetBitmap || !material.imageData) return null;
            const rect = cloneValidRect(material.rect || {
                x1: material.x,
                y1: material.y,
                x2: Number(material.x) + Number(material.w),
                y2: Number(material.y) + Number(material.h),
            });
            const bounds = cloneValidRect(targetBounds);
            if (!rectHasArea(rect) || !rectHasArea(bounds) || !rectContainsRect(rect, bounds)) return null;
            const x = finiteNumber(material.x, rect.x1);
            const y = finiteNumber(material.y, rect.y1);
            const w = positiveNumber(material.w, rect.x2 - rect.x1, 0);
            const h = positiveNumber(material.h, rect.y2 - rect.y1, 0);
            if (w <= 0 || h <= 0) return null;
            return {
                materialId: String(material.materialId || ''),
                kind: 'copied-target-restore',
                targetBitmap,
                targetSurfaceId: String(material.targetSurfaceId || ''),
                targetRevisionBefore: Number(material.targetRevisionBefore) || 0,
                rect,
                x,
                y,
                w,
                h,
                imageData: material.imageData,
            };
        }

        function drawCopiedBitmapTarget(entry, target, renderedText) {
            if (!isUsableCopiedBitmapTarget(target) || !renderedText) return false;
            const copiedEntry = entry
                ? createCopiedBitmapEntry(entry, target)
                : createCopiedBitmapProjectionEntry(target);
            if (!copiedEntry) return false;
            try {
                drawBitmapTextValue(target.targetBitmap, copiedEntry, renderedText);
                target.lastRenderedText = String(renderedText);
                target.lastRenderedAt = Date.now();
                return true;
            } catch (error) {
                reportCopiedTargetError('redraw', error);
                return false;
            }
        }

        function createCopiedBitmapEntry(entry, target) {
            if (!entry || !target || !isUsableBitmap(target.targetBitmap)) return null;
            return Object.assign(Object.create(entry), {
                bitmap: target.targetBitmap,
                state: null,
                drawParams: Object.assign({}, entry.drawParams || {}, target.drawParams || {}),
                drawState: target.drawState || entry.drawState || null,
                bounds: target.bounds || entry.bounds || null,
                methodName: entry.methodName || 'drawText',
                ownerType: 'bitmap',
            });
        }

        function createCopiedBitmapProjectionEntry(target) {
            if (!target || !isUsableBitmap(target.targetBitmap)) return null;
            return {
                bitmap: target.targetBitmap,
                state: null,
                drawParams: Object.assign({}, target.drawParams || {}),
                drawState: target.drawState || null,
                bounds: target.bounds || null,
                methodName: target.methodName || 'drawText',
                ownerType: 'bitmap',
                sourceRunId: target.sourceRunId || '',
                sourceSlotKey: target.sourceSlotKey || '',
                sourceSurfaceId: target.sourceSurfaceId || '',
            };
        }

        function isPreparedCopiedBitmapTarget(targetBitmap, target) {
            return !!(target
                && target.targetBitmap === targetBitmap
                && isUsableCopiedBitmapTarget(target));
        }

        function isUsableCopiedBitmapTarget(target) {
            return !!(target
                && isUsableBitmap(target.targetBitmap)
                && rectHasArea(target.bounds)
                && target.targetRestoreMaterial
                && target.drawParams
                && Number.isFinite(Number(target.drawParams.x))
                && Number.isFinite(Number(target.drawParams.y)));
        }

        function isUsableBitmap(bitmap) {
            return !!(bitmap
                && Number.isFinite(Number(bitmap.width))
                && Number(bitmap.width) > 0
                && Number.isFinite(Number(bitmap.height))
                && Number(bitmap.height) > 0);
        }

        function rectContainsRect(outer, inner) {
            if (!rectHasArea(outer) || !rectHasArea(inner)) return false;
            return Number(inner.x1) >= Number(outer.x1)
                && Number(inner.y1) >= Number(outer.y1)
                && Number(inner.x2) <= Number(outer.x2)
                && Number(inner.y2) <= Number(outer.y2);
        }

        function rectsOverlap(left, right) {
            if (!rectHasArea(left) || !rectHasArea(right)) return false;
            return Number(left.x1) < Number(right.x2)
                && Number(left.x2) > Number(right.x1)
                && Number(left.y1) < Number(right.y2)
                && Number(left.y2) > Number(right.y1);
        }

        function cloneValidRect(rect) {
            if (!isValidRect(rect)) return null;
            return {
                x1: Number(rect.x1),
                y1: Number(rect.y1),
                x2: Number(rect.x2),
                y2: Number(rect.y2),
            };
        }

        function rectKey(rect) {
            const value = cloneValidRect(rect);
            return value ? `${value.x1},${value.y1},${value.x2},${value.y2}` : '';
        }

        function reportCopiedTargetError(operation, error) {
            if (typeof scope.reportAdapterError === 'function') {
                scope.reportAdapterError(`copiedTargets.${operation}`, error);
            }
        }

        return {
            registerCopiedBitmapTargetProvider,
            materializeCopiedBitmapTargetsBeforeMutation,
            redrawMaterializedCopiedBitmapTargetsAfterMutation,
            invalidateCopiedBitmapTargetsForMutation,
            materializeCopiedBitmapTargetRedraws,
            redrawCopiedBitmapTargets,
        };
    }

            return { create: createController };
        },
    });
})();
