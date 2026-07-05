// Window text adapter support: copied-target replay ownership.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.copiedTargetReplay',
        requires: {
            surfaceRoleState: 'runtime.windowSurfaceRoleState',
            sourceRunIdentity: 'runtime.bitmap.sourceRunIdentity',
        },
        factory({ surfaceRoleState, sourceRunIdentity }) {

    const COPIED_TARGET_PROVIDER_TOKEN = 'window-text';

    function createCopiedTargetReplayController(context = {}) {
        const { entryLifecycleState } = context;
        const {
            windowEntryBelongsToContents: windowEntryBelongsToContentsCallback,
            resolveBitmapWindowData: resolveBitmapWindowDataCallback,
            getWindowEntrySnapshotBounds: getWindowEntrySnapshotBoundsCallback,
        } = context;
        const services = context.services || {};
        const facades = context.facades || {};
        const bitmapTools = context.bitmapTools || {};
        const { replay: replayService, surface: surfaceService, draw: drawService = {} } = services;
        const { entryRecords = {}, renderDraw = {}, textConversion = {}, textMetrics = {} } = facades;
        const { isEntryCompleted, findEntryBySourceRun, findEntriesBySourceRegion } = entryRecords;
        const { drawTranslatedWindowText } = renderDraw;
        const { sanitizeDrawTextOutput } = textConversion;
        const {
            collectIdentityAliases,
            collectSourceRunIds,
            collectSourceSlotKeyAliases: collectSourceSlotKeyAliasesFromValues,
            collectSourceSlotKeys,
            sourceRunIdentitiesMatch,
        } = sourceRunIdentity;
        const sourceSlotAliasOptions = {
            canonicalizeSlotKey: typeof textMetrics.canonicalizeSlotKey === 'function'
                ? textMetrics.canonicalizeSlotKey
                : null,
        };
        const collectSourceIdentityAliases = (...values) => collectIdentityAliases(values);
        const collectSourceSlotKeyAliases = (...values) => collectSourceSlotKeyAliasesFromValues(values, sourceSlotAliasOptions);
        const { calculateBitmapSurfaceTextYOffset, cloneIntelRect, isValidRect } = bitmapTools;
        const windowEntryBelongsToContents = requireFunction(windowEntryBelongsToContentsCallback, 'windowEntryBelongsToContents');
        const resolveBitmapWindowData = requireFunction(resolveBitmapWindowDataCallback, 'resolveBitmapWindowData');
        const getWindowEntrySnapshotBounds = requireFunction(getWindowEntrySnapshotBoundsCallback, 'getWindowEntrySnapshotBounds');
        requireFunction(isEntryCompleted, 'entryRecords.isEntryCompleted');
        requireFunction(findEntryBySourceRun, 'entryRecords.findEntryBySourceRun');
        requireFunction(findEntriesBySourceRegion, 'entryRecords.findEntriesBySourceRegion');
        requireFunction(sanitizeDrawTextOutput, 'textConversion.sanitizeDrawTextOutput');
        requireFunction(calculateBitmapSurfaceTextYOffset, 'bitmapTools.calculateBitmapSurfaceTextYOffset');
        requireFunction(cloneIntelRect, 'bitmapTools.cloneIntelRect');
        requireFunction(isValidRect, 'bitmapTools.isValidRect');

        let copiedTargetProviderUnregister = null;

        function registerCopiedWindowTextTargetProvider() {
            if (copiedTargetProviderUnregister) return true;
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.registerCopiedTargetProvider !== 'function') return false;
            copiedTargetProviderUnregister = bitmapDraws.registerCopiedTargetProvider({
                token: COPIED_TARGET_PROVIDER_TOKEN,
                collectCopiedTargetCandidates: collectCopiedWindowTextTargetProviderCandidates,
                drawCopiedTargetCandidate: drawCopiedWindowTextTargetProviderCandidate,
            });
            return typeof copiedTargetProviderUnregister === 'function';
        }

        function materializeCopiedTargetsBeforeBitmapMutation(targetBitmap, methodName, mutation = {}) {
            if (!isCopiedWindowTextMutation(targetBitmap, methodName, mutation)) {
                return materializeExistingCopiedTargetsBeforeTargetMutation(targetBitmap, methodName, mutation);
            }
            const sourceBitmap = mutation.sourceBitmap || null;
            const sourceRect = cloneValidReplayRect(mutation.sourceRect);
            const targetRect = cloneValidReplayRect(mutation.rect);
            if (!sourceBitmap || sourceBitmap === targetBitmap || !sourceRect || !targetRect) return [];
            const pendingMaterialized = materializePendingCopiedWindowTextTargetsBeforeCopy(
                sourceBitmap,
                targetBitmap,
                sourceRect,
                targetRect,
                methodName,
                mutation
            );
            if (pendingMaterialized.length) return pendingMaterialized;

            const match = resolveBitmapWindowData(sourceBitmap);
            if (!match || !match.windowData || !match.windowData.texts || typeof match.windowData.texts.forEach !== 'function') return [];

            const materialized = [];
            try {
                match.windowData.texts.forEach((entry) => {
                    if (!entry || entryLifecycleState.isStale(entry) || !windowEntryBelongsToCopiedSource(entry, sourceBitmap)) return;
                    const sourceBounds = getWindowEntrySnapshotBounds(sourceBitmap, entry) || entry.bounds;
                    const copiedSourceBounds = clipRectToBitmap(sourceBounds, sourceBitmap);
                    if (!rectHasArea(copiedSourceBounds) || !rectsOverlap(sourceRect, copiedSourceBounds)) return;
                    const copiedTarget = materializeCopiedRenderTargetForEntry(
                        entry,
                        targetBitmap,
                        sourceBitmap,
                        sourceRect,
                        targetRect,
                        copiedSourceBounds,
                        methodName,
                        mutation
                    );
                    if (copiedTarget) {
                        materialized.push({
                            entry,
                            target: copiedTarget,
                            projectionRecord: createCopiedWindowTextTargetProjectionRecord(entry, copiedTarget),
                        });
                    }
                });
            } catch (_) {}
            return materialized;
        }

        function materializePendingCopiedWindowTextTargetsBeforeCopy(sourceBitmap, targetBitmap, sourceRect, targetRect, methodName, mutation = {}) {
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.getPendingCopiedTextTargetMaterializations !== 'function') return [];
            let targets = [];
            try {
                targets = bitmapDraws.getPendingCopiedTextTargetMaterializations(sourceBitmap, {
                    targetBitmap,
                    sourceRect,
                    targetRect,
                    targetRestoreMaterialId: mutation && mutation.targetRestoreMaterialId || '',
                    targetRestoreRect: mutation && mutation.targetRestoreRect || null,
                    targetRestoreRevisionBefore: mutation && mutation.targetRestoreRevisionBefore,
                    mutationId: mutation && mutation.mutationId || '',
                    methodName,
                });
            } catch (_) {
                targets = [];
            }
            if (!Array.isArray(targets)) targets = [];
            const materialized = [];
            const seenEntries = new Set();
            targets.forEach((targetDescriptor) => {
                const entry = findWindowEntryForPendingCopiedTarget(targetDescriptor, sourceBitmap);
                if (!entry || entryLifecycleState.isStale(entry)) return;
                if (seenEntries.has(entry)) return;
                seenEntries.add(entry);
                const target = materializePendingCopiedWindowTextTargetForEntry(
                    entry,
                    targetDescriptor,
                    sourceBitmap,
                    targetBitmap,
                    sourceRect,
                    targetRect,
                    methodName,
                    mutation
                );
                if (!target) return;
                materialized.push({
                    entry,
                    target,
                    projectionRecord: createCopiedWindowTextTargetProjectionRecord(entry, target),
                });
            });
            collectWindowEntriesForPendingCopyRegion(sourceBitmap, sourceRect).forEach((entry) => {
                if (!entry || entryLifecycleState.isStale(entry) || seenEntries.has(entry)) return;
                seenEntries.add(entry);
                const entrySourceBounds = resolveCopiedEntrySourceBounds(sourceBitmap, entry);
                if (!rectHasArea(entrySourceBounds) || !rectsOverlap(sourceRect, entrySourceBounds)) return;
                const target = materializePendingCopiedWindowTextTargetFromEntry(
                    entry,
                    sourceBitmap,
                    targetBitmap,
                    sourceRect,
                    targetRect,
                    entrySourceBounds,
                    methodName,
                    mutation
                );
                if (!target) return;
                materialized.push({
                    entry,
                    target,
                    projectionRecord: createCopiedWindowTextTargetProjectionRecord(entry, target),
                });
            });
            return materialized;
        }

        function collectWindowEntriesForPendingCopyRegion(sourceBitmap, sourceRect) {
            if (!sourceBitmap || !sourceRect) return [];
            try {
                const entries = findEntriesBySourceRegion({ sourceBitmap, sourceRect });
                return Array.isArray(entries) ? entries : [];
            } catch (_) {
                return [];
            }
        }

        function materializePendingCopiedWindowTextTargetForEntry(entry, targetDescriptor, sourceBitmap, targetBitmap, sourceRect, targetRect, methodName, mutation = {}) {
            const entrySourceBounds = resolveCopiedEntrySourceBounds(sourceBitmap, entry);
            if (!rectHasArea(entrySourceBounds)) return null;
            const directTarget = createCopiedRenderTargetFromMaterialization(entry, targetDescriptor, methodName);
            if (directTarget && rectContainsRect(directTarget.sourceBounds, entrySourceBounds)) {
                return directTarget;
            }
            return materializePendingCopiedWindowTextTargetFromEntry(
                entry,
                sourceBitmap,
                targetBitmap,
                sourceRect,
                targetRect,
                entrySourceBounds,
                methodName,
                mutation
            );
        }

        function resolveCopiedEntrySourceBounds(sourceBitmap, entry) {
            if (!entry) return null;
            return sourceBitmap
                ? clipRectToBitmap(getWindowEntrySnapshotBounds(sourceBitmap, entry) || entry.bounds, sourceBitmap)
                : cloneValidReplayRect(entry.bounds);
        }

        function materializePendingCopiedWindowTextTargetFromEntry(entry, sourceBitmap, targetBitmap, sourceRect, targetRect, sourceBounds, methodName, mutation = {}) {
            return materializeCopiedRenderTargetForEntry(
                entry,
                targetBitmap,
                sourceBitmap,
                sourceRect,
                targetRect,
                sourceBounds,
                methodName,
                mutation
            );
        }

        function materializeExistingCopiedTargetsBeforeTargetMutation(targetBitmap, methodName, mutation = {}) {
            const targetRect = resolveTargetMutationRect(targetBitmap, mutation);
            if (!targetBitmap || !targetRect) return [];
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.collectCopiedTargetRestoreSeeds !== 'function') return [];
            const seeds = bitmapDraws.collectCopiedTargetRestoreSeeds({
                providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                targetBitmap,
                restoreRect: targetRect,
                mutationMethodName: methodName,
                reason: 'window-target-mutation',
            });
            return seeds.map((candidate) => ({ candidate }));
        }

        function redrawMaterializedCopiedTargetsAfterBitmapMutation(targetBitmap, methodName, mutation = {}, materialized = []) {
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
                if (!entry || entryLifecycleState.isStale(entry) || !isCopiedRenderTargetCurrent(targetBitmap, methodName, mutation, target)) return;
                const candidate = createCopiedWindowTextTargetCandidate(entry, target, entry.renderedText, { seed: true });
                if (!candidate) return;
                committed += 1;
                seedCandidates.push(candidate);
            });
            const redrawn = redrawCopiedWindowTextRestoreCandidates(seedCandidates, {
                reason: 'window-copy-target-redraw',
            });
            return { committed, redrawn };
        }

        function invalidateCopiedTargetsForBitmapMutation(targetBitmap, rect = null, _reason = 'bitmap-mutation') {
            if (!targetBitmap) return 0;
            const entries = collectWindowEntriesForInvalidatedCopyEdges(targetBitmap, rect);
            if (!entries.size) return 0;
            let removed = 0;
            Array.from(entries).forEach((entry) => {
                if (!entry || entryLifecycleState.isStale(entry)) return;
                removed += 1;
            });
            return removed;
        }

        function collectWindowEntriesForInvalidatedCopyEdges(targetBitmap, rect = null) {
            const entries = new Set();
            const edges = getInvalidatedCopyEdgesToBitmap(targetBitmap, rect);
            if (!edges.length) return entries;
            const bitmapDraws = replayService && replayService.bitmapDraws;
            edges.forEach((edge) => {
                const sourceBitmap = resolveCopyEdgeSourceBitmap(bitmapDraws, edge);
                collectCopyEdgeSourceRunLookups(edge, sourceBitmap).forEach((lookup) => {
                    const entry = findEntryBySourceRun(lookup);
                    if (isWindowEntryInvalidatedByCopyEdge(entry, edge, sourceBitmap, lookup.sourceTextRun)) {
                        entries.add(entry);
                    }
                });
                const match = sourceBitmap ? resolveBitmapWindowData(sourceBitmap) : null;
                const windowData = match && match.windowData || null;
                if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return;
                try {
                    windowData.texts.forEach((entry) => {
                        if (isWindowEntryInvalidatedByCopyEdge(entry, edge, sourceBitmap)) entries.add(entry);
                    });
                } catch (_) {}
            });
            return entries;
        }

        function collectCopyEdgeSourceRunLookups(edge, sourceBitmap) {
            const sourceSurfaceId = String(edge && edge.sourceSurfaceId || '');
            if (!sourceSurfaceId) return [];
            const lookups = [];
            const seen = new Set();
            const sourceRuns = Array.isArray(edge && edge.sourceTextRuns)
                ? edge.sourceTextRuns
                : [];
            sourceRuns.forEach((run) => {
                const sourceRunId = String(run && run.runId || '');
                const sourceSlotKey = String(run && run.slotKey || '');
                pushCopyEdgeSourceRunLookup(lookups, seen, {
                    sourceBitmap,
                    sourceSurfaceId,
                    sourceRunId,
                    sourceSlotKey,
                    sourceTextRun: run || null,
                });
            });
            pushCopyEdgeSourceRunLookup(lookups, seen, {
                sourceBitmap,
                sourceSurfaceId,
                sourceRunId: String(edge && edge.sourceRunId || ''),
                sourceSlotKey: String(edge && edge.sourceSlotKey || ''),
                sourceTextRun: null,
            });
            return lookups;
        }

        function pushCopyEdgeSourceRunLookup(lookups, seen, lookup) {
            const sourceRunId = String(lookup && lookup.sourceRunId || '');
            const sourceSlotKey = String(lookup && lookup.sourceSlotKey || '');
            if (!sourceRunId && !sourceSlotKey) return;
            const key = [
                String(lookup && lookup.sourceSurfaceId || ''),
                sourceRunId,
                sourceSlotKey,
            ].join('|');
            if (seen.has(key)) return;
            seen.add(key);
            lookups.push(lookup);
        }

        function getInvalidatedCopyEdgesToBitmap(targetBitmap, rect = null) {
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!targetBitmap || !bitmapDraws
                || typeof bitmapDraws.getInvalidatedCopyEdgesTo !== 'function') {
                return [];
            }
            let edges = [];
            try {
                edges = bitmapDraws.getInvalidatedCopyEdgesTo(targetBitmap, { targetRect: rect });
            } catch (_) {
                edges = [];
            }
            if (!Array.isArray(edges) || !edges.length) return [];
            return edges.filter((edge) => !!(edge && edge.sourceSurfaceId));
        }

        function resolveCopyEdgeSourceBitmap(bitmapDraws, edge) {
            if (!bitmapDraws || typeof bitmapDraws.getSurfaceById !== 'function' || !edge || !edge.sourceSurfaceId) return null;
            try {
                return bitmapDraws.getSurfaceById(edge.sourceSurfaceId) || null;
            } catch (_) {
                return null;
            }
        }

        function isWindowEntryInvalidatedByCopyEdge(entry, edge, sourceBitmap, sourceTextRun = null) {
            if (!entry || entryLifecycleState.isStale(entry)) return false;
            if (sourceBitmap
                && !windowEntryBelongsToCopiedSource(entry, sourceBitmap)
                && !windowEntryMatchesCopyEdgeSourceRun(entry, edge, sourceTextRun)) {
                return false;
            }
            const rawBounds = sourceTextRun && sourceTextRun.bounds
                || getWindowEntrySnapshotBounds(sourceBitmap, entry)
                || entry.bounds;
            const sourceBounds = sourceBitmap
                ? clipRectToBitmap(rawBounds, sourceBitmap)
                : cloneValidReplayRect(rawBounds);
            if (!rectHasArea(sourceBounds)) return false;
            const sourceRun = createCopiedSourceTextRun(entry, sourceBounds);
            if (!sourceRun) return false;
            if (sourceRun.surfaceId && edge.sourceSurfaceId && sourceRun.surfaceId !== edge.sourceSurfaceId) return false;
            if (!isSourceRunCurrentForCopyEdge(sourceRun, edge)) return false;
            const sourceRect = cloneValidReplayRect(edge.sourceRect);
            return rectContainsRect(sourceRect, sourceBounds);
        }

        function windowEntryMatchesCopyEdgeSourceRun(entry, edge, sourceTextRun = null) {
            if (!entry || !edge) return false;
            const sourceRun = createCopiedSourceTextRun(entry, sourceTextRun && sourceTextRun.bounds || entry.bounds);
            if (!sourceRun) return false;
            const sourceSurfaceId = String(edge.sourceSurfaceId || sourceTextRun && sourceTextRun.surfaceId || '');
            if (sourceSurfaceId && sourceRun.surfaceId && sourceRun.surfaceId !== sourceSurfaceId) return false;
            return sourceRunIdentitiesMatch(sourceRun, createCopyEdgeSourceLookup(edge, sourceTextRun));
        }

        function isSourceRunCurrentForCopyEdge(sourceRun, edge) {
            const runRevision = Number(sourceRun && sourceRun.revision);
            const edgeRevision = Number(edge && edge.sourceRevision);
            if (!Number.isFinite(runRevision) || !Number.isFinite(edgeRevision)) return true;
            return runRevision <= edgeRevision;
        }

        function materializeCopiedRenderTargetsForEntry(entry) {
            const ledgerTargets = materializeCopiedRenderTargetsFromLedger(entry);
            if (ledgerTargets.length) return ledgerTargets;
            return materializeCopiedRenderTargetsFromDetachedProof(entry);
        }

        function hasLedgerCopiedTargetsForBitmap(targetBitmap) {
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.hasCurrentCopyEdgesTo !== 'function') return false;
            try {
                return bitmapDraws.hasCurrentCopyEdgesTo(targetBitmap) === true;
            } catch (_) {
                return false;
            }
        }

        function redrawCopiedWindowTextTargets(entry, translatedText = '', options = {}) {
            if (!entry) return 0;
            const rendered = sanitizeDrawTextOutput(translatedText || entry.renderedText || '', entry.type);
            if (!rendered) return 0;
            const targets = Array.isArray(options && options.materializedTargets)
                ? options.materializedTargets
                : materializeCopiedRenderTargetsForEntry(entry);
            if (!targets.length) return 0;
            const seedCandidates = targets
                .map((target) => createCopiedWindowTextTargetCandidate(entry, target, rendered, {
                    seed: true,
                    options,
                }))
                .filter(Boolean);
            return redrawCopiedWindowTextRestoreCandidates(seedCandidates, {
                reason: 'window-copy-target-redraw',
                compositionProofs: options && options.copiedTargetCompositionProofs,
            });
        }

        function redrawCopiedWindowTextRestoreCandidates(seedCandidates, options = {}) {
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.redrawCopiedTargetRestoreComposition !== 'function') return 0;
            return bitmapDraws.redrawCopiedTargetRestoreComposition({
                providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                seedCandidates,
                reason: options && options.reason || 'window-copy-target-redraw',
                compositionProofs: options && options.compositionProofs,
            }) || 0;
        }

        function collectCopiedWindowTextTargetProviderCandidates(request = {}) {
            const candidates = [];
            const projected = collectProjectedCopiedWindowTextTargetProviderCandidates(request);
            if (Array.isArray(projected)) {
                projected.forEach((candidate) => {
                    if (candidate) candidates.push(candidate);
                });
            }
            collectLiveCopiedWindowTextTargetProviderCandidates(request).forEach((candidate) => {
                if (candidate) candidates.push(candidate);
            });
            return dedupeCopiedWindowTextTargetCandidates(candidates);
        }

        function collectLiveCopiedWindowTextTargetProviderCandidates(request = {}) {
            const candidates = [];
            if (!surfaceService || typeof surfaceService.forEachRegisteredWindow !== 'function') return candidates;
            surfaceService.forEachRegisteredWindow((windowInstance) => {
                const windowData = surfaceService.getWindowData(windowInstance);
                if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return;
                try {
                    windowData.texts.forEach((entry) => {
                        if (!entry || entryLifecycleState.isStale(entry)) return;
                        if (!entry.renderedText) return;
                        const eligibility = describeCopiedTargetProviderEligibility(entry, request);
                        if (!eligibility.eligible) return;
                        materializeCopiedRenderTargetsForEntry(entry).forEach((target) => {
                            const candidate = createCopiedWindowTextTargetCandidate(entry, target, entry.renderedText, {
                                request,
                                eligibility,
                            });
                            if (candidate) candidates.push(candidate);
                        });
                    });
                } catch (_) {}
            });
            return candidates;
        }

        function dedupeCopiedWindowTextTargetCandidates(candidates) {
            const result = [];
            const seen = new Set();
            (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
                if (!candidate) return;
                const key = createCopiedWindowTextTargetCandidateKey(candidate);
                if (seen.has(key)) return;
                seen.add(key);
                result.push(candidate);
            });
            return result;
        }

        function createCopiedWindowTextTargetCandidateKey(candidate) {
            const target = candidate && candidate.target && typeof candidate.target === 'object'
                ? candidate.target
                : candidate;
            const sourceSurfaceId = String(candidate && candidate.sourceSurfaceId || target && target.sourceSurfaceId || '');
            const sourceRunId = String(candidate && candidate.sourceRunId || target && target.sourceRunId || '');
            const sourceSlotKey = String(candidate && candidate.sourceSlotKey || target && target.sourceSlotKey || '');
            const edgeId = String(candidate && candidate.edgeId || target && target.edgeId || '');
            const targetSurfaceId = String(candidate && candidate.targetSurfaceId || target && target.targetSurfaceId || '');
            const targetBoundsKey = rectKey(candidate && (candidate.targetBounds || candidate.bounds) || target && (target.bounds || target.targetBounds));
            if ((sourceRunId || sourceSlotKey) && (edgeId || targetSurfaceId || targetBoundsKey)) {
                return [
                    String(candidate && candidate.providerToken || ''),
                    sourceSurfaceId,
                    sourceRunId,
                    sourceSlotKey,
                    edgeId,
                    targetSurfaceId,
                    targetBoundsKey,
                ].join('|');
            }
            return [
                String(candidate && candidate.providerToken || ''),
                String(candidate && candidate.entryId || ''),
                '',
                '',
                '',
            ].join('|');
        }

        function collectProjectedCopiedWindowTextTargetProviderCandidates(request = {}) {
            const targetBitmap = request && request.targetBitmap || null;
            if (!targetBitmap) return null;
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.getProjectedTextRunsForTarget !== 'function') return null;
            const projectedRuns = bitmapDraws.getProjectedTextRunsForTarget(targetBitmap, {
                targetRect: request.restoreRect || request.targetRect || request.rect || null,
            });
            if (!Array.isArray(projectedRuns)) return [];
            const candidates = [];
            projectedRuns.forEach((projection) => {
                if (isProjectionForOtherCopiedTargetProvider(projection)) return;
                const projectedCandidate = createProjectedCopiedWindowTextTargetCandidate(projection, targetBitmap, request);
                if (projectedCandidate) {
                    candidates.push(projectedCandidate);
                    return;
                }
                const entry = findWindowEntryForProjectedTextRun(projection);
                if (!entry || entryLifecycleState.isStale(entry)) return;
                if (!entry.renderedText) return;
                const eligibility = describeCopiedTargetProviderEligibility(entry, request);
                if (!eligibility.eligible) return;
                const projectedTarget = createCopiedRenderTargetFromProjection(projection, targetBitmap);
                if (projectedTarget && isProjectedWindowTarget(projection, projectedTarget, targetBitmap)) {
                    const candidate = createCopiedWindowTextTargetCandidate(entry, projectedTarget, entry.renderedText, {
                        request,
                        eligibility,
                    });
                    if (candidate) {
                        candidates.push(candidate);
                        return;
                    }
                }
                materializeCopiedRenderTargetsForEntry(entry).forEach((target) => {
                    if (!isProjectedWindowTarget(projection, target, targetBitmap)) return;
                    const candidate = createCopiedWindowTextTargetCandidate(entry, target, entry.renderedText, {
                        request,
                        eligibility,
                    });
                    if (candidate) candidates.push(candidate);
                });
            });
            return candidates;
        }

        function describeCopiedTargetProviderEligibility(entry, request = {}, options = {}) {
            const activeSeed = isActiveCopiedTargetRedrawSeed(entry, options)
                || isRequestActiveCopiedTargetSeed(entry, request);
            if (activeSeed) {
                const pending = entry && entry.renderTransaction && typeof entry.renderTransaction === 'object'
                    ? entry.renderTransaction
                    : null;
                return createRenderEligibility(true, 'active-seed', {
                    phase: String(pending && pending.phase || 'render-admitted'),
                    commandId: String(pending && pending.commandId || ''),
                    activeSeed: true,
                });
            }
            if (!isEntryCompleted(entry)) {
                return createRenderEligibility(false, 'entry-not-completed', {
                    phase: getEntryRenderPhase(entry),
                });
            }
            const proof = describeEntryRenderCommitProof(entry);
            if (proof.hasCommittedProof) {
                return createRenderEligibility(true, 'render-committed', proof);
            }
            return createRenderEligibility(false, 'missing-render-commit-proof', proof);
        }

        function isActiveCopiedTargetRedrawSeed(entry, options = {}) {
            if (!(options && options.seed === true) || !entry) return false;
            const pending = entry.renderTransaction && typeof entry.renderTransaction === 'object'
                ? entry.renderTransaction
                : null;
            if (!pending) return false;
            const phase = String(pending.phase || '');
            return phase === 'render-admitted'
                || phase === 'render-deferred'
                || pending.deferred === true
                || pending.status === 'admitted'
                || pending.status === 'deferred';
        }

        function isRequestActiveCopiedTargetSeed(entry, request = {}) {
            if (!entry || !request || typeof request !== 'object') return false;
            const seed = request.seedCandidate && typeof request.seedCandidate === 'object'
                ? request.seedCandidate
                : null;
            if (!seed || seed.seed !== true) return false;
            if (seed.entry && seed.entry === entry) return isActiveCopiedTargetRedrawSeed(entry, { seed: true });
            const entryId = String(entry.recordId || entry.itemId || entry.id || entry.key || '');
            return !!(entryId
                && String(seed.entryId || '') === entryId
                && isActiveCopiedTargetRedrawSeed(entry, { seed: true }));
        }

        function describeEntryRenderCommitProof(entry) {
            const proof = entry && entry.renderCommitProof && typeof entry.renderCommitProof === 'object'
                ? entry.renderCommitProof
                : null;
            const phase = String(proof && proof.phase || getEntryRenderPhase(entry));
            const commandId = String(proof && proof.commandId || '');
            const surfaceProof = proof && proof.surfaceProof && typeof proof.surfaceProof === 'object'
                ? proof.surfaceProof
                : null;
            const proofGeneration = Number(proof && proof.generation);
            const entryGeneration = Number(entry && entry.surfaceRevision);
            const generationMatches = !Number.isFinite(proofGeneration)
                || !Number.isFinite(entryGeneration)
                || proofGeneration === entryGeneration;
            return {
                phase,
                commandId,
                hasCommittedProof: !!(proof
                    && phase === 'render-committed'
                    && surfaceProof
                    && generationMatches),
                activeSeed: false,
            };
        }

        function getEntryRenderPhase(entry) {
            const pending = entry && entry.renderTransaction && typeof entry.renderTransaction === 'object'
                ? entry.renderTransaction
                : null;
            if (pending && pending.phase) return String(pending.phase);
            if (pending && pending.deferred === true) return 'render-deferred';
            return '';
        }

        function createRenderEligibility(eligible, reason, details = {}) {
            return Object.freeze({
                eligible: eligible === true,
                reason: String(reason || ''),
                phase: String(details && details.phase || ''),
                commandId: String(details && details.commandId || ''),
                hasCommittedProof: details && details.hasCommittedProof === true,
                activeSeed: details && details.activeSeed === true,
            });
        }

        function createProjectedCopiedWindowTextTargetCandidate(projection, targetBitmap, request = {}) {
            if (!hasWindowProjectionOwnership(projection)) return null;
            const textType = getProjectionTextType(projection);
            const rendered = sanitizeDrawTextOutput(getProjectionValue(projection, 'renderedText') || '', textType);
            if (!rendered) {
                recordProjectionSkip(request, projection, 'missing-rendered-text');
                return null;
            }
            if (textType === 'drawTextEx') {
                recordProjectionSkip(request, projection, 'missing-window-entry-for-rich-text');
                return null;
            }
            const target = createCopiedRenderTargetFromProjection(projection, targetBitmap);
            if (!target) {
                recordProjectionSkip(request, projection, 'missing-target-replay-data');
                return null;
            }
            const candidate = createCopiedWindowTextTargetCandidate(null, target, rendered, {
                projectionOwned: true,
                entryId: createProjectedCopiedWindowTextTargetEntryKey(projection, target),
                sourceDrawOrder: Number(getProjectionValue(projection, 'sourceDrawOrder')) || 0,
                textType,
                request,
            });
            if (!candidate) {
                recordProjectionSkip(request, projection, 'invalid-projected-candidate');
                return null;
            }
            return candidate;
        }

        function isProjectionForOtherCopiedTargetProvider(projection) {
            const providerToken = String(getProjectionValue(projection, 'providerToken') || '');
            const sourceAdapter = String(getProjectionValue(projection, 'sourceAdapter') || '');
            return !!((providerToken && providerToken !== COPIED_TARGET_PROVIDER_TOKEN)
                || (sourceAdapter && sourceAdapter !== 'window-text'));
        }

        function hasWindowProjectionOwnership(projection) {
            const providerToken = String(getProjectionValue(projection, 'providerToken') || '');
            const sourceAdapter = String(getProjectionValue(projection, 'sourceAdapter') || '');
            return providerToken === COPIED_TARGET_PROVIDER_TOKEN || sourceAdapter === 'window-text';
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

        function getProjectionTextType(projection) {
            return String(
                getProjectionValue(projection, 'textType')
                || getProjectionValue(projection, 'entryType')
                || getProjectionValue(projection, 'drawTextType')
                || ''
            );
        }

        function createProjectedCopiedWindowTextTargetEntryKey(projection, target) {
            const explicit = String(getProjectionValue(projection, 'entryId') || '');
            if (explicit) return explicit;
            return [
                String(getProjectionValue(projection, 'sourceSlotKey') || target && target.sourceSlotKey || ''),
                String(getProjectionValue(projection, 'sourceRunId') || target && target.sourceRunId || ''),
                String(target && target.edgeId || getProjectionValue(projection, 'edgeId') || ''),
                rectKey(target && target.bounds || getProjectionValue(projection, 'targetBounds')),
            ].join('|');
        }

        function recordProjectionSkip(request, projection, reason) {
            const skipReason = String(reason || 'projection-not-replayable');
            if (projection && typeof projection === 'object') {
                projection.skipReason = skipReason;
                projection.copiedTargetSkipReason = skipReason;
            }
            const skipped = request && (request.skippedCandidates || request.skippedProjections);
            if (Array.isArray(skipped)) {
                skipped.push({
                    providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                    reason: skipReason,
                    entryId: String(getProjectionValue(projection, 'entryId') || ''),
                    edgeId: String(getProjectionValue(projection, 'edgeId') || ''),
                    targetSurfaceId: String(getProjectionValue(projection, 'targetSurfaceId') || ''),
                    targetBounds: cloneValidReplayRect(getProjectionValue(projection, 'targetBounds') || projection && projection.bounds || null),
                });
            }
        }

        function findWindowEntryForProjectedTextRun(projection) {
            if (!projection) return null;
            const bitmapDraws = replayService && replayService.bitmapDraws;
            const sourceBitmap = projection.sourceBitmap
                || resolveCopyEdgeSourceBitmap(bitmapDraws, projection)
                || null;
            const entry = findEntryBySourceRun({ projection, sourceBitmap });
            return isWindowEntryForProjectedTextRun(entry, projection, sourceBitmap) ? entry : null;
        }

        function findWindowEntryForPendingCopiedTarget(targetDescriptor, sourceBitmap) {
            if (!targetDescriptor) return null;
            const projection = targetDescriptor.projection && typeof targetDescriptor.projection === 'object'
                ? targetDescriptor.projection
                : targetDescriptor;
            const sourceTextRun = createSourceTextRunFromCopiedTargetDescriptor(targetDescriptor);
            const sourceSurfaceId = String(targetDescriptor.sourceSurfaceId || projection.sourceSurfaceId || sourceTextRun && sourceTextRun.surfaceId || '');
            const sourceRunId = String(targetDescriptor.sourceRunId || projection.sourceRunId || sourceTextRun && sourceTextRun.runId || '');
            const sourceSlotKey = String(targetDescriptor.sourceSlotKey || projection.sourceSlotKey || sourceTextRun && sourceTextRun.slotKey || '');
            if (!sourceSurfaceId || (!sourceRunId && !sourceSlotKey)) return null;
            const entry = findEntryBySourceRun({
                sourceBitmap,
                sourceSurfaceId,
                sourceRunId,
                sourceSlotKey,
                sourceTextRun,
            });
            return isWindowEntryForProjectedTextRun(entry, {
                sourceSurfaceId,
                sourceRunId,
                sourceSlotKey,
                sourceBounds: sourceTextRun && sourceTextRun.bounds || null,
                sourceTextRun,
            }, sourceBitmap) ? entry : null;
        }

        function createSourceTextRunFromCopiedTargetDescriptor(targetDescriptor) {
            if (!targetDescriptor || typeof targetDescriptor !== 'object') return null;
            const projection = targetDescriptor.projection && typeof targetDescriptor.projection === 'object'
                ? targetDescriptor.projection
                : {};
            const bounds = cloneValidReplayRect(targetDescriptor.sourceBounds || projection.sourceBounds || null);
            return {
                runId: String(targetDescriptor.sourceRunId || projection.sourceRunId || ''),
                runIds: collectSourceIdentityAliases(
                    targetDescriptor.sourceRunIds,
                    projection.sourceRunIds,
                    targetDescriptor.sourceRunId,
                    projection.sourceRunId
                ),
                surfaceId: String(targetDescriptor.sourceSurfaceId || projection.sourceSurfaceId || ''),
                revision: firstFiniteNumber(targetDescriptor.sourceRevision, projection.sourceRevision, 0),
                slotKey: String(targetDescriptor.sourceSlotKey || projection.sourceSlotKey || ''),
                slotKeys: collectSourceSlotKeyAliases(
                    targetDescriptor.sourceSlotKeys,
                    projection.sourceSlotKeys,
                    targetDescriptor.sourceSlotKey,
                    projection.sourceSlotKey
                ),
                bounds,
            };
        }

        function isWindowEntryForProjectedTextRun(entry, projection, sourceBitmap) {
            if (!entry || entryLifecycleState.isStale(entry) || !projection) return false;
            if (sourceBitmap && !windowEntryBelongsToCopiedSource(entry, sourceBitmap)
                && !windowEntryMatchesCopiedTargetIdentity(entry, projection)) return false;
            const sourceBounds = clipRectToBitmap(getWindowEntrySnapshotBounds(sourceBitmap, entry) || entry.bounds, sourceBitmap);
            if (!rectHasArea(sourceBounds)) return false;
            const sourceRun = createCopiedSourceTextRun(entry, sourceBounds);
            if (!sourceRun) return false;
            const surfaceId = String(projection.sourceSurfaceId || projection.sourceTextRun && projection.sourceTextRun.surfaceId || '');
            if (surfaceId && sourceRun.surfaceId && sourceRun.surfaceId !== surfaceId) return false;
            return sourceRunIdentitiesMatch(sourceRun, createProjectionSourceLookup(projection));
        }

        function isProjectedWindowTarget(projection, target, targetBitmap) {
            if (!projection || !isUsableCopiedRenderTarget(target) || target.targetBitmap !== targetBitmap) return false;
            const edgeId = String(projection.edgeId || '');
            if (edgeId && String(target.edgeId || '') !== edgeId) return false;
            const targetSurfaceId = String(projection.targetSurfaceId || '');
            if (targetSurfaceId && String(target.targetSurfaceId || '') !== targetSurfaceId) return false;
            const sourceRect = cloneValidReplayRect(target.sourceRect || getProjectionValue(projection, 'sourceRect') || null);
            const sourceBounds = cloneValidReplayRect(target.sourceBounds || getProjectionValue(projection, 'sourceBounds') || null);
            if (!rectHasArea(sourceRect) || !rectHasArea(sourceBounds) || !rectsOverlap(sourceRect, sourceBounds)) return false;
            const projectedTargetBounds = cloneValidReplayRect(getProjectionValue(projection, 'targetBounds') || projection.bounds || null);
            if (rectHasArea(projectedTargetBounds) && !sameReplayRect(projectedTargetBounds, target.bounds)) return false;
            return true;
        }

        function drawCopiedWindowTextTargetProviderCandidate(candidate) {
            if (!candidate) return false;
            return drawCopiedWindowTextTarget(
                candidate.entry,
                candidate.target,
                candidate.renderedText,
                candidate.options || {}
            );
        }

        function createCopiedWindowTextTargetCandidate(entry, target, renderedText, options = {}) {
            const projectionOwned = options && options.projectionOwned === true;
            if ((!entry && !projectionOwned) || !isUsableCopiedRenderTarget(target)) return null;
            if (!isCopiedRenderTargetInsideRestoreRequest(target, options && options.request)) return null;
            const eligibility = projectionOwned
                ? createRenderEligibility(true, 'projection-owned', {
                    phase: 'projection-owned',
                    hasCommittedProof: false,
                })
                : (options && options.eligibility && typeof options.eligibility === 'object'
                    ? options.eligibility
                    : describeCopiedTargetProviderEligibility(entry, options && options.request, options));
            if (entry && !eligibility.eligible) return null;
            if (entry && !isLiveWindowEntryCopiedTargetEligible(entry, target)) return null;
            const textType = entry && entry.type || options && options.textType || target && target.textType || '';
            const rendered = sanitizeDrawTextOutput(renderedText || entry && entry.renderedText || '', textType);
            if (!rendered) return null;
            const restoreCoverageRects = collectCopiedWindowTextTargetRestoreCoverageRects(entry, target, rendered);
            const sourceDrawOrder = entry
                ? (entry.drawOrder || 0)
                : (Number(options && options.sourceDrawOrder) || Number(target.sourceDrawOrder) || 0);
            return {
                providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                entryId: String(options && options.entryId || createCopiedWindowTextTargetEntryKey(entry)),
                entry,
                target,
                renderedText: rendered,
                targetBitmap: target.targetBitmap,
                targetSurfaceId: target.targetSurfaceId,
                targetBounds: target.bounds,
                targetRestoreMaterial: target.targetRestoreMaterial,
                restoreCoverageRects,
                edgeId: target.edgeId,
                sourceSurfaceId: String(target.sourceSurfaceId || entry && entry.surfaceId || ''),
                sourceRunId: String(target.sourceRunId || ''),
                sourceSlotKey: String(target.sourceSlotKey || entry && entry.slotKey || ''),
                targetRevision: target.targetRevision,
                targetRestoreRevisionBefore: target.targetRestoreMaterial && target.targetRestoreMaterial.targetRevisionBefore,
                sourceDrawOrder,
                seed: options && options.seed === true,
                options: options && options.options || null,
                projectionOwned,
                eligibility,
            };
        }

        function createCopiedWindowTextTargetProjectionRecord(entry, target) {
            if (!entry || !isUsableCopiedRenderTarget(target)) return null;
            const rendered = sanitizeDrawTextOutput(entry.renderedText || '', entry.type);
            return {
                providerToken: COPIED_TARGET_PROVIDER_TOKEN,
                sourceAdapter: 'window-text',
                entryId: createCopiedWindowTextTargetEntryKey(entry),
                sourceSurfaceId: String(target.sourceSurfaceId || entry.surfaceId || ''),
                sourceRunId: String(target.sourceRunId || ''),
                sourceRunIds: collectSourceIdentityAliases(target.sourceRunIds, entry.sourceRunIds, target.sourceRunId),
                sourceSlotKey: String(target.sourceSlotKey || entry.slotKey || ''),
                sourceSlotKeys: collectSourceSlotKeyAliases(
                    target.sourceSlotKeys,
                    entry.sourceSlotKeys,
                    target.sourceSlotKey,
                    entry.slotKey
                ),
                sourceBounds: cloneValidReplayRect(target.sourceBounds || entry.bounds),
                targetSurfaceId: String(target.targetSurfaceId || ''),
                targetBounds: cloneValidReplayRect(target.bounds || null),
                renderedText: rendered,
                drawGeometry: {
                    x: target.position && target.position.x,
                    y: target.position && target.position.y,
                    maxWidth: target.params && target.params.maxWidth,
                    lineHeight: target.params && target.params.lineHeight,
                    align: target.params && target.params.align,
                },
                drawState: target.drawState && typeof target.drawState === 'object'
                    ? Object.assign({}, target.drawState)
                    : (entry.drawState && typeof entry.drawState === 'object' ? Object.assign({}, entry.drawState) : null),
                sourceDrawOrder: Number(entry.drawOrder) || 0,
                textType: String(entry.type || ''),
                methodName: String(target.methodName || entry.type || ''),
            };
        }

        function collectCopiedWindowTextTargetRestoreCoverageRects(entry, target, renderedText) {
            const rects = [];
            const drawSlotRect = createCopiedWindowTextDrawSlotRestoreRect(entry, target, renderedText);
            if (rectHasArea(drawSlotRect)) rects.push(drawSlotRect);
            const copiedFootprintRect = createCopiedWindowTextCopiedFootprintRestoreRect(entry, target);
            if (rectHasArea(copiedFootprintRect)) rects.push(copiedFootprintRect);
            return rects.length ? rects : undefined;
        }

        function createCopiedWindowTextDrawSlotRestoreRect(entry, target, renderedText) {
            if (!target) return null;
            const textType = entry && entry.type || target && target.textType || '';
            if (textType === 'drawTextEx') return null;
            const position = target.position || {};
            const params = target.params || {};
            const drawX = normalizeCopiedCoordinate(position.x);
            const drawY = normalizeCopiedCoordinate(position.y);
            const maxWidth = Number(params.maxWidth);
            const lineHeight = Number(params.lineHeight);
            if (drawX === null || drawY === null || !Number.isFinite(maxWidth) || !Number.isFinite(lineHeight)) {
                return null;
            }
            if (maxWidth <= 0 || lineHeight <= 0) return null;
            const sourceYOffset = entry
                ? calculateBitmapSurfaceTextYOffset(entry.contentsBitmap || target.sourceBitmap, entry, renderedText)
                : 0;
            const yOffset = Number.isFinite(Number(sourceYOffset)) ? Number(sourceYOffset) * (Number(target.scaleY) || 1) : 0;
            return {
                x1: drawX,
                y1: drawY + yOffset,
                x2: drawX + maxWidth,
                y2: drawY + yOffset + lineHeight,
            };
        }

        function createCopiedWindowTextCopiedFootprintRestoreRect(entry, target) {
            const textType = entry && entry.type || target && target.textType || '';
            if (textType !== 'drawTextEx') return null;
            // Rich text can under-report targetBounds when control-code sizing
            // changes the copied source footprint. Restore a line-sized copied
            // footprint, but keep full-window copies bounded to the text target.
            const targetRect = cloneValidReplayRect(target && (target.targetRect || target.copyTargetRect) || null);
            const targetBounds = cloneValidReplayRect(target && (target.bounds || target.targetBounds) || null);
            const materialRect = cloneValidReplayRect(target && target.targetRestoreMaterial && target.targetRestoreMaterial.rect || null);
            if (!rectHasArea(targetRect) || !rectHasArea(targetBounds)) return null;
            if (materialRect && !rectContainsRect(materialRect, targetRect)) return null;
            if (!rectsOverlap(targetRect, targetBounds)) return null;
            const footprintHeight = targetRect.y2 - targetRect.y1;
            const textHeight = Math.max(1, targetBounds.y2 - targetBounds.y1);
            if (footprintHeight > textHeight * 2) return null;
            return targetRect;
        }

        function createCopiedWindowTextTargetEntryKey(entry) {
            if (!entry) return '';
            const explicit = String(entry.recordId || entry.itemId || entry.id || entry.key || '');
            if (explicit) return explicit;
            return [
                String(entry.slotKey || ''),
                String(entry.rawText || entry.visibleText || entry.convertedText || ''),
                String(Number(entry.drawOrder) || 0),
                rectKey(entry.bounds),
            ].join('|');
        }

        function materializeCopiedRenderTargetsFromLedger(entry) {
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!entry || !bitmapDraws || typeof bitmapDraws.getCopiedTextTargetMaterializations !== 'function') return [];
            const sourceBitmap = entry.sourceContentsBitmap || entry.contentsBitmap || null;
            if (!sourceBitmap) return [];
            const input = createCopiedTargetMaterializationInput(entry);
            if (!input) return [];
            let materialized = [];
            try {
                materialized = bitmapDraws.getCopiedTextTargetMaterializations(sourceBitmap, input);
            } catch (_) {
                materialized = [];
            }
            if (!Array.isArray(materialized) || !materialized.length) return [];
            return materialized
                .map((target) => createCopiedRenderTargetFromMaterialization(entry, target, target && target.methodName || 'ledger-copy'))
                .filter(Boolean);
        }

        function materializeCopiedRenderTargetsFromDetachedProof(entry) {
            const descriptors = getDetachedCopiedTargetDescriptors(entry);
            if (!descriptors.length) return [];
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws
                || typeof bitmapDraws.getSurfaceById !== 'function'
                || typeof bitmapDraws.getProjectedTextRunsForTarget !== 'function') {
                return [];
            }
            const targets = [];
            const seen = new Set();
            descriptors.forEach((descriptor) => {
                const targetBitmap = resolveProofDescriptorTargetBitmap(bitmapDraws, descriptor);
                if (!isUsableBitmap(targetBitmap)) return;
                collectProjectedTargetsForDetachedProofDescriptor(bitmapDraws, targetBitmap, descriptor).forEach((projection) => {
                    if (!isProjectionForDetachedProofDescriptor(projection, descriptor)) return;
                    const target = createCopiedRenderTargetFromProjection(projection, targetBitmap);
                    if (!target || !isLiveWindowEntryCopiedTargetEligible(entry, target)) return;
                    const key = createDetachedProofTargetKey(target);
                    if (seen.has(key)) return;
                    seen.add(key);
                    targets.push(target);
                });
            });
            return targets;
        }

        function getDetachedCopiedTargetDescriptors(entry) {
            const proof = entry && entry.detachedRenderProof && typeof entry.detachedRenderProof === 'object'
                ? entry.detachedRenderProof
                : null;
            if (!isCopiedContentsReplacementProof(proof)) return [];
            return Array.isArray(proof.copiedTargetDescriptors)
                ? proof.copiedTargetDescriptors.filter(Boolean)
                : [];
        }

        function isCopiedContentsReplacementProof(proof) {
            return !!(proof
                && String(proof.type || '') === 'copied-contents-replacement'
                && Number(proof.copiedTargets) > 0);
        }

        function resolveProofDescriptorTargetBitmap(bitmapDraws, descriptor) {
            const targetSurfaceId = String(descriptor && descriptor.targetSurfaceId || '');
            if (!targetSurfaceId) return null;
            try {
                return bitmapDraws.getSurfaceById(targetSurfaceId) || null;
            } catch (_) {
                return null;
            }
        }

        function collectProjectedTargetsForDetachedProofDescriptor(bitmapDraws, targetBitmap, descriptor) {
            const targetRect = cloneValidReplayRect(descriptor && (descriptor.targetRestoreRect || descriptor.targetBounds));
            const input = targetRect ? { targetRect } : {};
            try {
                const projections = bitmapDraws.getProjectedTextRunsForTarget(targetBitmap, input);
                return Array.isArray(projections) ? projections : [];
            } catch (_) {
                return [];
            }
        }

        function isProjectionForDetachedProofDescriptor(projection, descriptor) {
            if (!projection || !descriptor) return false;
            if (!sameOptionalString(getProjectionValue(projection, 'edgeId'), descriptor.edgeId)) return false;
            if (!sameOptionalString(getProjectionValue(projection, 'sourceSurfaceId'), descriptor.sourceSurfaceId)) return false;
            if (!sameOptionalString(getProjectionValue(projection, 'targetSurfaceId'), descriptor.targetSurfaceId)) return false;
            if (!optionalSourceIdentityMatches(createProjectionSourceLookup(projection), createDescriptorSourceLookup(descriptor))) return false;
            const descriptorBounds = cloneValidReplayRect(descriptor.targetBounds || descriptor.bounds);
            if (!descriptorBounds) return true;
            const projectionBounds = cloneValidReplayRect(
                getProjectionValue(projection, 'targetBounds')
                || projection.bounds
                || projection.materialization && (projection.materialization.bounds || projection.materialization.targetBounds)
            );
            return sameReplayRect(projectionBounds, descriptorBounds);
        }

        function sameOptionalString(value, expected) {
            const expectedText = String(expected || '');
            if (!expectedText) return true;
            return String(value || '') === expectedText;
        }

        function createCopyEdgeSourceLookup(edge, sourceTextRun = null) {
            return {
                sourceRunId: String(sourceTextRun && sourceTextRun.runId || edge && edge.sourceRunId || ''),
                sourceRunIds: collectSourceIdentityAliases(
                    sourceTextRun && sourceTextRun.runIds,
                    sourceTextRun && sourceTextRun.sourceRunIds,
                    edge && edge.sourceRunIds,
                    sourceTextRun && sourceTextRun.runId,
                    edge && edge.sourceRunId
                ),
                sourceSlotKey: String(sourceTextRun && sourceTextRun.slotKey || edge && edge.sourceSlotKey || ''),
                sourceSlotKeys: collectSourceSlotKeyAliases(
                    sourceTextRun && sourceTextRun.slotKeys,
                    sourceTextRun && sourceTextRun.sourceSlotKeys,
                    edge && edge.sourceSlotKeys,
                    sourceTextRun && sourceTextRun.slotKey,
                    edge && edge.sourceSlotKey
                ),
            };
        }

        function createProjectionSourceLookup(projection) {
            const sourceTextRun = projection && projection.sourceTextRun && typeof projection.sourceTextRun === 'object'
                ? projection.sourceTextRun
                : {};
            return {
                sourceRunId: String(getProjectionValue(projection, 'sourceRunId') || sourceTextRun.runId || sourceTextRun.sourceRunId || ''),
                sourceRunIds: collectSourceIdentityAliases(
                    getProjectionValue(projection, 'sourceRunIds'),
                    sourceTextRun.runIds,
                    sourceTextRun.sourceRunIds,
                    getProjectionValue(projection, 'sourceRunId'),
                    sourceTextRun.runId,
                    sourceTextRun.sourceRunId
                ),
                sourceSlotKey: String(getProjectionValue(projection, 'sourceSlotKey') || sourceTextRun.slotKey || sourceTextRun.sourceSlotKey || ''),
                sourceSlotKeys: collectSourceSlotKeyAliases(
                    getProjectionValue(projection, 'sourceSlotKeys'),
                    sourceTextRun.slotKeys,
                    sourceTextRun.sourceSlotKeys,
                    getProjectionValue(projection, 'sourceSlotKey'),
                    sourceTextRun.slotKey,
                    sourceTextRun.sourceSlotKey
                ),
            };
        }

        function createTargetSourceLookup(target) {
            const sourceTextRun = target && target.sourceTextRun && typeof target.sourceTextRun === 'object'
                ? target.sourceTextRun
                : {};
            return {
                sourceRunId: String(target && target.sourceRunId || sourceTextRun.runId || sourceTextRun.sourceRunId || ''),
                sourceRunIds: collectSourceIdentityAliases(
                    target && target.sourceRunIds,
                    sourceTextRun.runIds,
                    sourceTextRun.sourceRunIds,
                    target && target.sourceRunId,
                    sourceTextRun.runId,
                    sourceTextRun.sourceRunId
                ),
                sourceSlotKey: String(target && target.sourceSlotKey || sourceTextRun.slotKey || sourceTextRun.sourceSlotKey || ''),
                sourceSlotKeys: collectSourceSlotKeyAliases(
                    target && target.sourceSlotKeys,
                    sourceTextRun.slotKeys,
                    sourceTextRun.sourceSlotKeys,
                    target && target.sourceSlotKey,
                    sourceTextRun.slotKey,
                    sourceTextRun.sourceSlotKey
                ),
            };
        }

        function createDescriptorSourceLookup(descriptor) {
            return {
                sourceRunId: String(descriptor && descriptor.sourceRunId || ''),
                sourceRunIds: collectSourceIdentityAliases(
                    descriptor && descriptor.sourceRunIds,
                    descriptor && descriptor.sourceRunId
                ),
                sourceSlotKey: String(descriptor && descriptor.sourceSlotKey || ''),
                sourceSlotKeys: collectSourceSlotKeyAliases(
                    descriptor && descriptor.sourceSlotKeys,
                    descriptor && descriptor.sourceSlotKey
                ),
            };
        }

        function optionalSourceIdentityMatches(candidate, expected) {
            if (!collectSourceRunIds(expected).length && !collectSourceSlotKeys(expected).length) return true;
            return sourceRunIdentitiesMatch(candidate, expected);
        }

        function createDetachedProofTargetKey(target) {
            return [
                String(target && target.edgeId || ''),
                String(target && target.targetSurfaceId || ''),
                String(target && target.sourceRunId || ''),
                String(target && target.sourceSlotKey || ''),
                rectKey(target && target.bounds),
            ].join('|');
        }

        function createCopiedTargetMaterializationInput(entry) {
            const textRun = createCopiedSourceTextRun(entry, entry && entry.bounds);
            if (!textRun) return null;
            const position = entry.position || {};
            const params = entry.originalParams || {};
            return {
                runId: textRun.runId,
                slotKey: textRun.slotKey,
                textRun,
                drawGeometry: {
                    x: position.x,
                    y: position.y,
                    maxWidth: params.maxWidth,
                    lineHeight: params.lineHeight,
                    align: params.align,
                },
                drawState: entry.drawState || null,
            };
        }

        function isCopiedWindowTextMutation(targetBitmap, methodName, mutation) {
            const method = String(methodName || '');
            return !!(targetBitmap
                && (method === 'blt' || method === 'bltImage')
                && mutation
                && mutation.sourceBitmap
                && mutation.sourceRect
                && mutation.rect);
        }

        function resolveTargetMutationRect(targetBitmap, mutation = {}) {
            const rect = cloneValidReplayRect(mutation && (mutation.rect || mutation.targetRect));
            if (rect) return rect;
            if (!(mutation && mutation.full === true) || !isUsableBitmap(targetBitmap)) return null;
            return {
                x1: 0,
                y1: 0,
                x2: Number(targetBitmap.width),
                y2: Number(targetBitmap.height),
            };
        }

        function materializeCopiedRenderTargetForEntry(entry, targetBitmap, sourceBitmap, sourceRect, targetRect, sourceBounds, methodName, mutation = null) {
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.getPendingCopiedTextTargetMaterializations !== 'function') return null;
            const textRun = createCopiedSourceTextRun(entry, sourceBounds);
            if (!textRun) return null;
            const position = entry.position || {};
            const params = entry.originalParams || {};
            const materialized = bitmapDraws.getPendingCopiedTextTargetMaterializations(sourceBitmap, {
                targetBitmap,
                textRun,
                sourceRect,
                targetRect,
                targetRestoreMaterialId: mutation && mutation.targetRestoreMaterialId || '',
                targetRestoreRect: mutation && mutation.targetRestoreRect || null,
                targetRestoreRevisionBefore: mutation && mutation.targetRestoreRevisionBefore,
                drawGeometry: {
                    x: position.x,
                    y: position.y,
                    maxWidth: params.maxWidth,
                    lineHeight: params.lineHeight,
                    align: params.align,
                },
                drawState: entry.drawState || null,
            });
            const target = Array.isArray(materialized) && materialized.length ? materialized[0] : null;
            return createCopiedRenderTargetFromMaterialization(entry, target, methodName);
        }

        function createCopiedSourceTextRun(entry, bounds) {
            if (!entry) return null;
            const proofRun = createDetachedProofCopiedSourceTextRun(entry);
            if (proofRun) return proofRun;
            const runBounds = cloneValidReplayRect(bounds || entry.bounds);
            if (!rectHasArea(runBounds)) return null;
            const origin = entry.drawOrigin && typeof entry.drawOrigin === 'object'
                ? entry.drawOrigin
                : {};
            const boundary = origin.drawBoundary && typeof origin.drawBoundary === 'object'
                ? origin.drawBoundary
                : {};
            const runId = String(origin.runId || boundary.runId || '');
            const slotKey = String(origin.slotKey || boundary.slotKey || entry.slotKey || '');
            return {
                runId,
                runIds: collectSourceIdentityAliases(
                    origin.sourceRunIds,
                    boundary.sourceRunIds,
                    origin.ledgerRunIds,
                    boundary.ledgerRunIds,
                    runId
                ),
                surfaceId: String(origin.surfaceId || boundary.surfaceId || entry.surfaceId || ''),
                revision: firstFiniteNumber(origin.surfaceRevision, boundary.surfaceRevision, boundary.revision, entry.surfaceRevision, 0),
                slotKey,
                slotKeys: collectSourceSlotKeyAliases(
                    origin.sourceSlotKeys,
                    boundary.sourceSlotKeys,
                    origin.slotKeys,
                    boundary.slotKeys,
                    slotKey
                ),
                bounds: runBounds,
                drawState: entry.drawState || origin.drawState || null,
            };
        }

        function createDetachedProofCopiedSourceTextRun(entry) {
            const proof = entry && entry.detachedRenderProof && typeof entry.detachedRenderProof === 'object'
                ? entry.detachedRenderProof
                : null;
            if (!isCopiedContentsReplacementProof(proof)) return null;
            const descriptor = selectDetachedProofCopiedSourceDescriptor(proof, entry);
            const runBounds = cloneValidReplayRect(
                descriptor && descriptor.sourceBounds
                || entry && entry.bounds
                || null
            );
            if (!rectHasArea(runBounds)) return null;
            const runId = String(proof.sourceDrawRunId || descriptor && descriptor.sourceRunId || '');
            const slotKey = String(descriptor && descriptor.sourceSlotKey || proof.slotKey || entry && entry.slotKey || '');
            return {
                runId,
                runIds: collectSourceIdentityAliases(
                    proof.sourceDrawRunIds,
                    descriptor && descriptor.sourceRunIds,
                    runId
                ),
                surfaceId: String(proof.sourceDrawSurfaceId || descriptor && descriptor.sourceSurfaceId || entry && entry.surfaceId || ''),
                revision: firstFiniteNumber(
                    proof.sourceDrawSurfaceRevision,
                    descriptor && descriptor.sourceRevision,
                    entry && entry.contentsRevision,
                    entry && entry.surfaceRevision,
                    0
                ),
                slotKey,
                slotKeys: collectSourceSlotKeyAliases(
                    proof.sourceSlotKeys,
                    descriptor && descriptor.sourceSlotKeys,
                    slotKey
                ),
                bounds: runBounds,
                drawState: entry && entry.drawState || null,
            };
        }

        function selectDetachedProofCopiedSourceDescriptor(proof, entry) {
            const descriptors = Array.isArray(proof && proof.copiedTargetDescriptors)
                ? proof.copiedTargetDescriptors.filter(Boolean)
                : [];
            if (!descriptors.length) return null;
            const sourceRunId = String(proof && proof.sourceDrawRunId || '');
            const slotKey = String(proof && proof.slotKey || entry && entry.slotKey || '');
            const proofLookup = {
                sourceRunId,
                sourceRunIds: collectSourceIdentityAliases(proof && proof.sourceDrawRunIds, sourceRunId),
                sourceSlotKey: slotKey,
                sourceSlotKeys: collectSourceSlotKeyAliases(proof && proof.sourceSlotKeys, slotKey),
            };
            const matching = descriptors.find((descriptor) => {
                if (!descriptor) return false;
                return sourceRunIdentitiesMatch(createDescriptorSourceLookup(descriptor), proofLookup);
            });
            return matching || descriptors[0];
        }

        function createCopiedRenderTargetFromMaterialization(entry, materialized, methodName) {
            if (!entry || !materialized || !isUsableBitmap(materialized.targetBitmap)) return null;
            const sourceRect = cloneValidReplayRect(materialized.sourceRect);
            const targetRect = cloneValidReplayRect(materialized.targetRect);
            const sourceBounds = cloneValidReplayRect(materialized.sourceBounds);
            const bounds = cloneValidReplayRect(materialized.bounds || materialized.targetBounds);
            const drawParams = materialized.drawParams || materialized.drawGeometry || {};
            const drawX = Number(drawParams.x);
            const drawY = Number(drawParams.y);
            const scaleX = Number(materialized.scaleX);
            const scaleY = Number(materialized.scaleY);
            if (!rectHasArea(sourceRect)
                || !rectHasArea(targetRect)
                || !rectHasArea(sourceBounds)
                || !rectHasArea(bounds)
                || !Number.isFinite(drawX)
                || !Number.isFinite(drawY)
                || !Number.isFinite(scaleX)
                || !Number.isFinite(scaleY)
                || scaleX <= 0
                || scaleY <= 0) {
                return null;
            }
            const drawState = materialized.drawState && typeof materialized.drawState === 'object'
                ? Object.assign({}, materialized.drawState)
                : (entry.drawState && typeof entry.drawState === 'object' ? Object.assign({}, entry.drawState) : null);
            const targetRestoreMaterial = normalizeCopiedTargetRestoreMaterial(
                materialized.targetRestoreMaterial,
                materialized.targetBitmap,
                bounds
            );
            if (!targetRestoreMaterial) return null;
            return {
                edgeId: String(materialized.edgeId || ''),
                sourceRunId: String(materialized.sourceRunId || ''),
                sourceRunIds: collectSourceIdentityAliases(materialized.sourceRunIds, materialized.sourceRunId),
                sourceSlotKey: String(materialized.sourceSlotKey || ''),
                sourceSlotKeys: collectSourceSlotKeyAliases(materialized.sourceSlotKeys, materialized.sourceSlotKey),
                sourceSurfaceId: String(materialized.sourceSurfaceId || ''),
                targetSurfaceId: String(materialized.targetSurfaceId || ''),
                targetRevision: Number(materialized.targetRevision) || 0,
                targetBitmap: materialized.targetBitmap,
                sourceBitmap: materialized.sourceBitmap || entry.sourceContentsBitmap || entry.contentsBitmap || null,
                sourceRect,
                targetRect,
                sourceBounds,
                bounds,
                position: {
                    x: drawX,
                    y: drawY,
                },
                params: {
                    maxWidth: drawParams.maxWidth,
                    lineHeight: drawParams.lineHeight,
                    align: drawParams.align,
                },
                drawState,
                scaleX,
                scaleY,
                methodName: String(methodName || 'blt'),
                targetRestoreMaterial,
                createdAt: Date.now(),
            };
        }

        function createCopiedRenderTargetFromProjection(projection, targetBitmap) {
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
            const bounds = cloneValidReplayRect(
                getProjectionValue(projection, 'targetBounds')
                || materialized && (materialized.bounds || materialized.targetBounds)
                || projection && projection.bounds
                || null
            );
            const drawGeometry = getProjectionValue(projection, 'drawGeometry')
                || materialized && (materialized.drawParams || materialized.drawGeometry)
                || null;
            const materializedPosition = materialized && materialized.position || null;
            const materializedParams = materialized && materialized.params || null;
            const drawX = drawGeometry && drawGeometry.x !== undefined
                ? Number(drawGeometry.x)
                : Number(materializedPosition && materializedPosition.x);
            const drawY = drawGeometry && drawGeometry.y !== undefined
                ? Number(drawGeometry.y)
                : Number(materializedPosition && materializedPosition.y);
            const scaleX = firstFiniteNumber(materialized && materialized.scaleX, projection && projection.scaleX, 1);
            const scaleY = firstFiniteNumber(materialized && materialized.scaleY, projection && projection.scaleY, 1);
            if (!rectHasArea(bounds)
                || !Number.isFinite(drawX)
                || !Number.isFinite(drawY)
                || !Number.isFinite(scaleX)
                || !Number.isFinite(scaleY)
                || scaleX <= 0
                || scaleY <= 0) {
                return null;
            }
            const targetRestoreMaterial = normalizeCopiedTargetRestoreMaterial(
                materialized && materialized.targetRestoreMaterial || projection && projection.targetRestoreMaterial,
                resolvedTargetBitmap,
                bounds
            );
            if (!targetRestoreMaterial) return null;
            return {
                edgeId: String(getProjectionValue(projection, 'edgeId') || materialized && materialized.edgeId || ''),
                sourceRunId: String(getProjectionValue(projection, 'sourceRunId') || materialized && materialized.sourceRunId || ''),
                sourceRunIds: collectSourceIdentityAliases(
                    getProjectionValue(projection, 'sourceRunIds'),
                    materialized && materialized.sourceRunIds,
                    getProjectionValue(projection, 'sourceRunId'),
                    materialized && materialized.sourceRunId
                ),
                sourceSlotKey: String(getProjectionValue(projection, 'sourceSlotKey') || materialized && materialized.sourceSlotKey || ''),
                sourceSlotKeys: collectSourceSlotKeyAliases(
                    getProjectionValue(projection, 'sourceSlotKeys'),
                    materialized && materialized.sourceSlotKeys,
                    getProjectionValue(projection, 'sourceSlotKey'),
                    materialized && materialized.sourceSlotKey
                ),
                sourceSurfaceId: String(getProjectionValue(projection, 'sourceSurfaceId') || materialized && materialized.sourceSurfaceId || ''),
                targetSurfaceId: String(getProjectionValue(projection, 'targetSurfaceId') || materialized && materialized.targetSurfaceId || ''),
                targetRevision: firstFiniteNumber(getProjectionValue(projection, 'targetRevision'), materialized && materialized.targetRevision, 0),
                targetBitmap: resolvedTargetBitmap,
                sourceBitmap: materialized && materialized.sourceBitmap || projection && projection.sourceBitmap || null,
                sourceRect: cloneValidReplayRect(materialized && materialized.sourceRect || projection && projection.sourceRect || null),
                targetRect: cloneValidReplayRect(materialized && materialized.targetRect || projection && projection.targetRect || null),
                sourceBounds: cloneValidReplayRect(getProjectionValue(projection, 'sourceBounds') || materialized && materialized.sourceBounds || null),
                bounds,
                position: {
                    x: drawX,
                    y: drawY,
                },
                params: {
                    maxWidth: drawGeometry && drawGeometry.maxWidth !== undefined
                        ? drawGeometry.maxWidth
                        : materializedParams && materializedParams.maxWidth,
                    lineHeight: drawGeometry && drawGeometry.lineHeight !== undefined
                        ? drawGeometry.lineHeight
                        : materializedParams && materializedParams.lineHeight,
                    align: drawGeometry && drawGeometry.align !== undefined
                        ? drawGeometry.align
                        : materializedParams && materializedParams.align,
                },
                drawState: getProjectionValue(projection, 'drawState')
                    || materialized && materialized.drawState
                    || null,
                scaleX,
                scaleY,
                methodName: String(getProjectionValue(projection, 'methodName') || materialized && materialized.methodName || 'drawText'),
                textType: getProjectionTextType(projection),
                sourceDrawOrder: Number(getProjectionValue(projection, 'sourceDrawOrder')) || 0,
                targetRestoreMaterial,
                projectionRecord: projection && projection.projectionRecord || null,
                createdAt: Date.now(),
            };
        }

        function isLiveWindowEntryCopiedTargetEligible(entry, target) {
            if (!entry || !isUsableCopiedRenderTarget(target)) return false;
            const sourceBitmap = target.sourceBitmap || entry.sourceContentsBitmap || entry.contentsBitmap || null;
            if (!windowEntryBelongsToCopiedSource(entry, sourceBitmap)
                && !windowEntryMatchesCopiedTargetIdentity(entry, target)) return false;
            const sourceRect = cloneValidReplayRect(target.sourceRect);
            const sourceBounds = cloneValidReplayRect(target.sourceBounds || getWindowEntrySnapshotBounds(sourceBitmap, entry) || entry.bounds);
            if (!rectHasArea(sourceRect) || !rectHasArea(sourceBounds) || !rectsOverlap(sourceRect, sourceBounds)) return false;
            return isCopiedRenderTargetInsideRestoreMaterial(target);
        }

        function windowEntryBelongsToCopiedSource(entry, sourceBitmap) {
            if (!entry || !sourceBitmap) return false;
            if (entry.sourceContentsBitmap) return entry.sourceContentsBitmap === sourceBitmap;
            if (entry.contentsBitmap) return entry.contentsBitmap === sourceBitmap;
            return false;
        }

        function windowEntryMatchesCopiedTargetIdentity(entry, target) {
            if (!entry || !target || !isCopiedSourceEntry(entry)) return false;
            const sourceRun = createCopiedSourceTextRun(entry, target.sourceBounds || entry.bounds);
            if (!sourceRun) return false;
            const surfaceId = String(target.sourceSurfaceId || target.sourceTextRun && target.sourceTextRun.surfaceId || '');
            if (!surfaceId || !sourceRun.surfaceId || sourceRun.surfaceId !== surfaceId) return false;
            return sourceRunIdentitiesMatch(sourceRun, createTargetSourceLookup(target));
        }

        function isCopiedSourceEntry(entry) {
            return surfaceRoleState.isCopiedSourceEntry(entry, {
                copiedTargetReplacement: isCopiedContentsReplacementProof(entry && entry.detachedRenderProof),
            });
        }

        function isCopiedRenderTargetInsideRestoreRequest(target, request) {
            const restoreRect = cloneValidReplayRect(request && (request.restoreRect || request.targetRect || request.rect) || null);
            if (!restoreRect) return true;
            const bounds = cloneValidReplayRect(target && (target.bounds || target.targetBounds) || null);
            return rectContainsRect(restoreRect, bounds);
        }

        function isCopiedRenderTargetInsideRestoreMaterial(target) {
            const bounds = cloneValidReplayRect(target && (target.bounds || target.targetBounds) || null);
            const material = target && target.targetRestoreMaterial || null;
            const restoreRect = cloneValidReplayRect(material && (material.rect || material.bounds) || null);
            return rectContainsRect(restoreRect, bounds);
        }

        function firstFiniteNumber(...values) {
            for (const value of values) {
                const numeric = Number(value);
                if (Number.isFinite(numeric)) return numeric;
            }
            return 0;
        }

        function drawCopiedWindowTextTarget(entry, target, renderedText, options = {}) {
            if (!isUsableCopiedRenderTarget(target) || !renderedText) return false;
            const textType = entry && entry.type || target && target.textType || '';
            if (!entry && textType === 'drawTextEx') {
                target.skipReason = 'missing-window-entry-for-rich-text';
                return false;
            }
            const targetBitmap = target.targetBitmap;
            const position = target.position || {};
            const params = target.params || {};
            const drawX = normalizeCopiedCoordinate(position.x);
            const drawY = normalizeCopiedCoordinate(position.y);
            if (drawX === null || drawY === null) return false;
            const previousDrawState = drawService.captureBitmapDrawState
                ? drawService.captureBitmapDrawState(targetBitmap)
                : null;
            const drawState = target.drawState || entry && entry.drawState || null;
            try {
                if (drawState && drawService.applyBitmapDrawState) drawService.applyBitmapDrawState(targetBitmap, drawState);
                if (entry && entry.type === 'drawTextEx') {
                    return redrawCopiedRichWindowTextTarget(entry, target, renderedText, options);
                }
                const sourceYOffset = entry
                    ? calculateBitmapSurfaceTextYOffset(entry.contentsBitmap || target.sourceBitmap, entry, renderedText)
                    : 0;
                const yOffset = Number.isFinite(Number(sourceYOffset)) ? Number(sourceYOffset) * (Number(target.scaleY) || 1) : 0;
                withCopiedTargetDrawGuard(targetBitmap, () => {
                    targetBitmap.drawText(
                        renderedText,
                        drawX,
                        drawY + yOffset,
                        params.maxWidth,
                        params.lineHeight,
                        params.align
                    );
                });
                target.lastRenderedText = String(renderedText);
                target.lastRenderedAt = Date.now();
                return true;
            } catch (_) {
                return false;
            } finally {
                if (previousDrawState && drawService.applyBitmapDrawState) {
                    try { drawService.applyBitmapDrawState(targetBitmap, previousDrawState); } catch (_) {}
                }
            }
        }

        function redrawCopiedRichWindowTextTarget(entry, target, renderedText, options = {}) {
            if (!entry || !target || !renderedText || typeof drawTranslatedWindowText !== 'function') return false;
            const targetWindow = entry.ownerWindow || null;
            const targetBitmap = target.targetBitmap || null;
            if (!targetWindow || !targetBitmap || typeof targetWindow.processCharacter !== 'function') return false;
            const copiedEntry = createCopiedRenderEntry(entry, target);
            if (!copiedEntry) return false;
            let result = false;
            withCopiedTargetDrawGuard(targetBitmap, () => {
                result = drawTranslatedWindowText(targetWindow, targetBitmap, copiedEntry, renderedText, {
                    route: 'copiedTarget',
                    targetRole: 'copied-render-target',
                    textFit: mapCopiedTextFit(options && options.textFit, target),
                });
            });
            const commitProof = validateCopiedTargetRenderCommit(result, entry);
            if (!commitProof.accepted) {
                target.skipReason = commitProof.reason;
                return false;
            }
            target.lastRenderCommit = commitProof.commit;
            target.lastRenderedText = String(renderedText);
            target.lastRenderedAt = Date.now();
            return true;
        }

        function validateCopiedTargetRenderCommit(commit, entry) {
            if (!commit || typeof commit !== 'object') {
                return { accepted: false, reason: 'copied-target-render-commit-missing', commit: null };
            }
            const committed = commit.committed === true || String(commit.status || '') === 'committed';
            if (!committed) {
                return { accepted: false, reason: 'copied-target-render-not-committed', commit };
            }
            if (entry && entry.type === 'drawTextEx') {
                const primitiveCount = Number(commit.bitmapDrawPrimitiveCount);
                if (!Number.isFinite(primitiveCount) || primitiveCount <= 0) {
                    return { accepted: false, reason: 'copied-target-rich-render-no-primitives', commit };
                }
            }
            return { accepted: true, reason: '', commit };
        }

        function createCopiedRenderEntry(entry, target) {
            if (!entry || !target || !isUsableBitmap(target.targetBitmap)) return null;
            const copiedEntry = Object.create(entry);
            copiedEntry.position = Object.assign({}, entry.position || {}, target.position || {});
            copiedEntry.originalParams = Object.assign({}, entry.originalParams || {}, target.params || {});
            copiedEntry.drawState = target.drawState || entry.drawState || null;
            copiedEntry.contentsBitmap = target.targetBitmap;
            copiedEntry.bounds = target.bounds || entry.bounds || null;
            copiedEntry.renderedBounds = target.bounds || entry.renderedBounds || null;
            copiedEntry.sourceContentsBitmap = target.targetBitmap;
            surfaceRoleState.applyWindowEntrySurfaceRole(copiedEntry, {
                sourceContentsBitmap: target.targetBitmap,
                sourceContentsRole: 'copied-render-target',
                renderSurfaceRole: 'copied-render-target',
                requiresCopiedTarget: false,
            });
            return copiedEntry;
        }

        function mapCopiedTextFit(textFit, target) {
            if (!textFit || textFit.applied !== true || !target) return textFit || null;
            const sourceRect = target.sourceRect || null;
            const targetRect = target.targetRect || null;
            const scaleX = Number(target.scaleX);
            const originX = Number(textFit.originX);
            const mapped = Object.assign({}, textFit);
            if (Number.isFinite(originX)
                && Number.isFinite(scaleX)
                && sourceRect
                && targetRect) {
                mapped.originX = mapCopiedNumber(originX, sourceRect.x1, targetRect.x1, scaleX);
            }
            if (Number.isFinite(Number(mapped.safeMaxWidth)) && Number.isFinite(scaleX)) {
                mapped.safeMaxWidth = Number(mapped.safeMaxWidth) * scaleX;
            }
            if (Number.isFinite(Number(mapped.naturalWidth)) && Number.isFinite(scaleX)) {
                mapped.naturalWidth = Number(mapped.naturalWidth) * scaleX;
            }
            if (Number.isFinite(Number(mapped.gap)) && Number.isFinite(scaleX)) {
                mapped.gap = Number(mapped.gap) * scaleX;
            }
            return mapped;
        }

        function withCopiedTargetDrawGuard(bitmap, callback) {
            const api = replayService && replayService.bitmapDraws;
            if (api && typeof api.withWindowPipelineGuard === 'function') {
                return api.withWindowPipelineGuard(bitmap, callback, 'window-copy-target-redraw');
            }
            return typeof callback === 'function' ? callback() : undefined;
        }

        function rectKey(rect) {
            const value = cloneValidReplayRect(rect);
            return value ? `${value.x1},${value.y1},${value.x2},${value.y2}` : '';
        }

        function normalizeCopiedTargetRestoreMaterial(material, targetBitmap, targetBounds) {
            if (!material || material.targetBitmap !== targetBitmap || !material.imageData) return null;
            const rect = cloneValidReplayRect(material.rect || {
                x1: material.x,
                y1: material.y,
                x2: Number(material.x) + Number(material.w),
                y2: Number(material.y) + Number(material.h),
            });
            const bounds = cloneValidReplayRect(targetBounds);
            if (!rectHasArea(rect) || !rectHasArea(bounds) || !rectContainsRect(rect, bounds)) return null;
            const x = firstFiniteNumber(material.x, rect.x1);
            const y = firstFiniteNumber(material.y, rect.y1);
            const w = firstFiniteNumber(material.w, rect.x2 - rect.x1);
            const h = firstFiniteNumber(material.h, rect.y2 - rect.y1);
            if (w <= 0 || h <= 0) return null;
            return {
                materialId: String(material.materialId || ''),
                kind: 'copied-target-restore',
                targetBitmap,
                targetSurfaceId: String(material.targetSurfaceId || ''),
                targetRevisionBefore: Number(material.targetRevisionBefore) || 0,
                rect,
                bounds: cloneIntelRect(rect),
                x,
                y,
                w,
                h,
                imageData: material.imageData,
            };
        }

        function isCopiedRenderTargetCurrent(targetBitmap, methodName, mutation, target) {
            if (!target || target.targetBitmap !== targetBitmap) return false;
            if (String(target.methodName || '') !== String(methodName || '')) return false;
            if (!sameReplayRect(target.targetRect, mutation && mutation.rect)) return false;
            if (!sameReplayRect(target.sourceRect, mutation && mutation.sourceRect)) return false;
            return isUsableCopiedRenderTarget(target);
        }

        function isUsableCopiedRenderTarget(target) {
            return !!(target && isUsableBitmap(target.targetBitmap) && rectHasArea(target.bounds));
        }

        function sameReplayRect(a, b) {
            const left = cloneValidReplayRect(a);
            const right = cloneValidReplayRect(b);
            if (!left || !right) return false;
            return left.x1 === right.x1 && left.y1 === right.y1 && left.x2 === right.x2 && left.y2 === right.y2;
        }

        function cloneValidReplayRect(rect) {
            if (!rect || !isValidRect(rect)) return null;
            return {
                x1: Number(rect.x1),
                y1: Number(rect.y1),
                x2: Number(rect.x2),
                y2: Number(rect.y2),
            };
        }

        function rectHasArea(rect) {
            return !!(rect && isValidRect(rect) && Number(rect.x2) > Number(rect.x1) && Number(rect.y2) > Number(rect.y1));
        }

        function rectContainsRect(outer, inner) {
            return !!(rectHasArea(outer)
                && rectHasArea(inner)
                && Number(inner.x1) >= Number(outer.x1)
                && Number(inner.y1) >= Number(outer.y1)
                && Number(inner.x2) <= Number(outer.x2)
                && Number(inner.y2) <= Number(outer.y2));
        }

        function rectsOverlap(left, right) {
            return !!(rectHasArea(left)
                && rectHasArea(right)
                && Number(left.x1) < Number(right.x2)
                && Number(left.x2) > Number(right.x1)
                && Number(left.y1) < Number(right.y2)
                && Number(left.y2) > Number(right.y1));
        }

        function clipRectToBitmap(rect, bitmap) {
            if (!rectHasArea(rect) || !isUsableBitmap(bitmap)) return null;
            const clipped = {
                x1: Math.max(Number(rect.x1), 0),
                y1: Math.max(Number(rect.y1), 0),
                x2: Math.min(Number(rect.x2), Number(bitmap.width)),
                y2: Math.min(Number(rect.y2), Number(bitmap.height)),
            };
            return rectHasArea(clipped) ? clipped : null;
        }

        function mapCopiedNumber(value, sourceStart, targetStart, scale) {
            const number = Number(value);
            const source = Number(sourceStart);
            const target = Number(targetStart);
            const ratio = Number(scale);
            if (![number, source, target, ratio].every(Number.isFinite)) return 0;
            return target + ((number - source) * ratio);
        }

        function normalizeCopiedCoordinate(value) {
            const number = Number(value);
            return Number.isFinite(number) ? number : null;
        }

        function isUsableBitmap(bitmap) {
            return !!(bitmap
                && Number.isFinite(Number(bitmap.width))
                && Number(bitmap.width) > 0
                && Number.isFinite(Number(bitmap.height))
                && Number(bitmap.height) > 0);
        }

        return {
            registerCopiedWindowTextTargetProvider,
            materializeCopiedTargetsBeforeBitmapMutation,
            redrawMaterializedCopiedTargetsAfterBitmapMutation,
            invalidateCopiedTargetsForBitmapMutation,
            hasLedgerCopiedTargetsForBitmap,
            materializeCopiedRenderTargetsForEntry,
            redrawCopiedWindowTextTargets,
        };
    }

    function requireFunction(value, name) {
        if (typeof value !== 'function') {
            throw new Error(`[WindowText] copied-target replay requires ${name}.`);
        }
        return value;
    }
            return { create: createCopiedTargetReplayController };
        },
    });
})();
