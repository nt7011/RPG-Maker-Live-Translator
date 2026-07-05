// Window text adapter support: detached render proof.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.renderProof',
        requires: {
            surfaceRoleState: 'runtime.windowSurfaceRoleState',
        },
        factory({ surfaceRoleState }) {

    function createRenderProofController(context = {}) {
    const { entryLifecycleState } = context;
    const { bitmapReplay, drawIdentity, entryRecords, textMetrics } = context.facades;
    const { firstNonEmptyString } = entryRecords;
    const { materializeCopiedRenderTargetsForEntry } = bitmapReplay;
    const { getSurfaceId } = textMetrics;
    const { getEntrySlotKey, isSameLogicalDrawSlot } = drawIdentity;

    function resolveDetachedRenderTarget(entry, windowData, windowInstance) {
                if (!entry || !windowData || !windowInstance) {
                    return rejectProof('detached-render-target-missing', createProofDetails(entry, windowData, null));
                }

                const materializationCache = createProofMaterializationCache();
                const reason = getDetachedInvalidationReason(entry);
                if (isObsoleteDetachedEntry(entry, reason)) {
                    return rejectProof('detached-entry-obsolete', createProofDetails(entry, windowData, null, {
                        reason,
                    }, materializationCache));
                }
                const freshnessRejection = rejectStaleDetachedContentsRecovery(entry, windowData, reason, materializationCache);
                if (freshnessRejection) return freshnessRejection;

                if (!requiresExplicitDetachedProof(reason)) {
                    const conflict = findSlotConflict(windowData, entry, materializationCache);
                    if (conflict) {
                        return rejectSlotConflict(entry, windowData, conflict, reason, materializationCache);
                    }
                    return acceptProof(entry, createDetachedRecordProof(entry, windowData, reason, materializationCache));
                }

                const currentEntry = findCurrentSourceEntry(windowData, entry);
                if (currentEntry) {
                    const conflict = findSlotConflict(windowData, currentEntry, materializationCache);
                    if (conflict) {
                        return rejectSlotConflict(currentEntry, windowData, conflict, reason, materializationCache);
                    }
                    return acceptProof(currentEntry, createCurrentSourceProof(entry, currentEntry, windowData, reason, materializationCache));
                }

                const replacement = createImmediateContentsReplacementProof(entry, windowInstance, windowData, reason, materializationCache);
                if (!replacement.accepted) return replacement;
                const replacementFreshnessRejection = rejectStaleDetachedContentsRecovery(entry, windowData, reason, materializationCache);
                if (replacementFreshnessRejection) return replacementFreshnessRejection;
                const conflict = findSlotConflict(windowData, entry, materializationCache);
                if (conflict) {
                    return rejectSlotConflict(entry, windowData, conflict, reason, materializationCache);
                }
                return acceptProof(entry, replacement.proof);
            }

    function createDetachedRecordProof(entry, windowData, reason, materializationCache = null) {
                return Object.assign(createProofDetails(entry, windowData, 'detached-record', {
                    reason,
                }, materializationCache), {
                    type: 'detached-record',
                });
            }

    function createCurrentSourceProof(detachedEntry, currentEntry, windowData, reason, materializationCache = null) {
                const sourceDraw = getSourceDraw(currentEntry);
                return Object.assign(createProofDetails(currentEntry, windowData, 'current-source', {
                    reason,
                    sourceRecordId: detachedEntry && detachedEntry.recordId || '',
                    sourceContentsRevision: readRevision(detachedEntry && detachedEntry.contentsRevision),
                    sourceDrawPhase: sourceDraw && sourceDraw.phase || '',
                    sourceCommitted: sourceDraw && sourceDraw.sourceCommitted === true,
                    sourceDrawGeneration: readGeneration(sourceDraw && sourceDraw.entryGeneration),
                }, materializationCache), {
                    type: 'current-source',
                });
            }

    function createImmediateContentsReplacementProof(entry, windowInstance, windowData, reason, materializationCache = null) {
                const details = createProofDetails(entry, windowData, 'immediate-contents-replacement', {
                    reason,
                }, materializationCache);
                if (entry.type !== 'drawTextEx') {
                    return rejectProof('detached-proof-method-unsupported', details);
                }
                if (windowData._trUnregistered || windowInstance._destroyed || windowInstance.destroyed) {
                    return rejectProof('detached-proof-window-unavailable', details);
                }
                if (entry.ownerWindow && entry.ownerWindow !== windowInstance) {
                    return rejectProof('detached-proof-owner-mismatch', details);
                }
                if (!hasImmediateContentsReplacementProof(entry, windowData)) {
                    return rejectProof('detached-proof-contents-generation-mismatch', details);
                }

                const sourceDraw = getSourceDraw(entry);
                if (!sourceDraw || sourceDraw.phase !== 'source-draw-committed' || sourceDraw.sourceCommitted !== true) {
                    return rejectProof('detached-proof-source-draw-uncommitted', details);
                }
                if (!sameText(sourceDraw.recordId, entry.recordId)) {
                    return rejectProof('detached-proof-record-mismatch', details);
                }
                if (!sameSlotIdentity(sourceDraw.slotKey, entry.slotKey)) {
                    return rejectProof('detached-proof-slot-mismatch', details);
                }
                if (!sameGeneration(sourceDraw.entryGeneration, entry.surfaceRevision)) {
                    return rejectProof('detached-proof-generation-mismatch', details);
                }

                if (details.copiedTargets > 0) {
                    return acceptProof(entry, Object.assign(details, {
                        type: 'copied-contents-replacement',
                        sourceDrawPhase: sourceDraw.phase || '',
                        sourceCommitted: true,
                        sourceDrawGeneration: readGeneration(sourceDraw.entryGeneration),
                        copiedTargetReplacement: true,
                    }));
                }
                if (surfaceRoleState.isCopiedStagingEntry(entry)) {
                    return rejectProof('detached-proof-requires-copied-target', details);
                }

                return acceptProof(entry, Object.assign(details, {
                    type: 'immediate-contents-replacement',
                    sourceDrawPhase: sourceDraw.phase || '',
                    sourceCommitted: true,
                    sourceDrawGeneration: readGeneration(sourceDraw.entryGeneration),
                }));
            }

    function findCurrentSourceEntry(windowData, detachedEntry) {
                if (!windowData || !windowData.texts || !detachedEntry) return null;
                const expectedSlot = getEntrySlotKey(detachedEntry);
                const expectedSource = firstNonEmptyString(
                    detachedEntry.normalizedSource,
                    detachedEntry.translationSource,
                    detachedEntry.convertedText,
                    detachedEntry.rawText
                ).trim();
                let match = null;
                try {
                    windowData.texts.forEach((candidate) => {
                        if (match || !candidate || entryLifecycleState.isStale(candidate)) return;
                        if (!sameSlotIdentity(getEntrySlotKey(candidate), expectedSlot)) return;
                        if (!sameCurrentContentsRevision(candidate, windowData)) return;
                        const candidateSource = firstNonEmptyString(
                            candidate.normalizedSource,
                            candidate.translationSource,
                            candidate.convertedText,
                            candidate.rawText
                        ).trim();
                        if (candidateSource && candidateSource === expectedSource) match = candidate;
                    });
                } catch (_) {}
                return match;
            }

    function findSlotConflict(windowData, entry, materializationCache = null) {
                if (!windowData || !windowData.texts || !entry) return null;
                const slotKey = getEntrySlotKey(entry);
                const entryBounds = cloneRect(entry.bounds || entry.renderedBounds || null);
                const entryHasCopiedTargets = getCopiedTargetConflictRects(entry, materializationCache).length > 0;
                let conflict = null;
                try {
                    windowData.texts.forEach((candidate) => {
                        if (conflict || !candidate || candidate === entry || entryLifecycleState.isStale(candidate)) return;
                        const candidateSlotKey = getEntrySlotKey(candidate);
                        if (sameSlotIdentity(candidateSlotKey, slotKey)) {
                            conflict = createDetachedRenderConflict(
                                candidate,
                                candidateSlotKey === slotKey ? 'slot-key' : 'canonical-slot-key'
                            );
                            return;
                        }
                        if (!sameCurrentContentsRevision(candidate, windowData)) return;
                        if (entryHasCopiedTargets || getCopiedTargetConflictRects(candidate, materializationCache).length > 0) return;
                        const candidateBounds = cloneRect(candidate.bounds || candidate.renderedBounds || null);
                        if (rectsOverlap(entryBounds, candidateBounds)) {
                            conflict = createDetachedRenderConflict(candidate, 'bounds-overlap');
                        }
                    });
                } catch (_) {}
                return conflict;
            }

    function rejectSlotConflict(entry, windowData, conflict, reason, materializationCache = null) {
                const conflictEntry = conflict && conflict.entry ? conflict.entry : conflict;
                const conflictDetails = conflict && conflict.details && typeof conflict.details === 'object'
                    ? conflict.details
                    : {};
                return rejectProof('detached-proof-slot-conflict', createProofDetails(entry, windowData, null, {
                    reason,
                    conflictReason: conflict && conflict.reason || '',
                    conflictRecordId: conflictEntry && conflictEntry.recordId || '',
                    conflictSlotKey: getEntrySlotKey(conflictEntry),
                    conflictContentsRevision: readRevision(conflictEntry && conflictEntry.contentsRevision),
                    conflictBounds: cloneRect(conflictEntry && (conflictEntry.bounds || conflictEntry.renderedBounds) || null),
                    conflictTargetSurfaceId: String(conflictDetails.conflictTargetSurfaceId || ''),
                    conflictTargetBounds: cloneRect(conflictDetails.conflictTargetBounds || null),
                    entryTargetSurfaceId: String(conflictDetails.entryTargetSurfaceId || ''),
                    entryTargetBounds: cloneRect(conflictDetails.entryTargetBounds || null),
                }, materializationCache));
            }

    function createDetachedRenderConflict(entry, reason, details = null) {
                return {
                    entry,
                    reason: String(reason || ''),
                    details: details && typeof details === 'object' ? details : {},
                };
            }

    function isObsoleteDetachedEntry(entry, reason) {
                const detachedDetails = entryLifecycleState.getDetachedDetails(entry);
                if (reason === 'contents-replaced') return false;
                if (detachedDetails && detachedDetails.allowDetachedReattach === true && isContentsInvalidationReason(reason)) {
                    return false;
                }
                return reason === 'window-entry-replaced'
                    || reason === 'window-entry-empty'
                    || isContentsInvalidationReason(reason);
            }

    function rejectStaleDetachedContentsRecovery(entry, windowData, reason, materializationCache = null) {
                if (!isContentsInvalidationReason(reason)) return null;
                const detachedDetails = entryLifecycleState.getDetachedDetails(entry);
                if (!(detachedDetails && detachedDetails.allowDetachedReattach === true)) return null;
                const sourceRevision = readRevision(entry && entry.contentsRevision);
                const targetRevision = readRevision(windowData && windowData.contentsRevision);
                if (sourceRevision === null || targetRevision === null) {
                    return rejectProof('detached-proof-contents-revision-missing', createProofDetails(entry, windowData, null, {
                        reason,
                    }, materializationCache));
                }
                if (targetRevision > sourceRevision + 1) {
                    return rejectProof('detached-proof-contents-revision-stale', createProofDetails(entry, windowData, null, {
                        reason,
                    }, materializationCache));
                }
                return null;
            }

    function requiresExplicitDetachedProof(reason) {
                return reason === 'contents-replaced';
            }

    function getDetachedInvalidationReason(entry) {
                return firstNonEmptyString(
                    entryLifecycleState.getDetachedReason(entry),
                    entryLifecycleState.getCanceledReason(entry),
                    entryLifecycleState.getPendingInvalidation(entry) && entryLifecycleState.getPendingInvalidation(entry).sourceReason
                );
            }

    function createProofDetails(entry, windowData, type, extra = {}, materializationCache = null) {
                const sourceDraw = getSourceDraw(entry);
                const copiedTargetDescriptors = materializeCopiedTargetDescriptors(entry, materializationCache);
                return Object.assign({
                    type: type || '',
                    recordId: entry && entry.recordId || '',
                    targetRecordId: entry && entry.recordId || '',
                    slotKey: getEntrySlotKey(entry),
                    surfaceId: entry && entry.surfaceId || getSurfaceId(windowData) || '',
                    identitySurfaceId: entry && entry.identitySurfaceId || '',
                    entryGeneration: readGeneration(entry && entry.surfaceRevision),
                    sourceContentsRevision: readRevision(entry && entry.contentsRevision),
                    targetContentsRevision: readRevision(windowData && windowData.contentsRevision),
                    sourceContentsRole: entry && entry.sourceContentsRole || '',
                    renderSurfaceRole: entry && entry.renderSurfaceRole || '',
                    sourceDrawPhase: sourceDraw && sourceDraw.phase || '',
                    sourceCommitted: sourceDraw && sourceDraw.sourceCommitted === true,
                    sourceDrawGeneration: readGeneration(sourceDraw && sourceDraw.entryGeneration),
                    sourceDrawId: sourceDraw && sourceDraw.id || '',
                    sourceDrawSurfaceId: sourceDraw && sourceDraw.surfaceId || '',
                    sourceDrawSurfaceRevision: readRevision(sourceDraw && sourceDraw.surfaceRevision),
                    sourceDrawRunId: sourceDraw && sourceDraw.runId || '',
                    sourceDrawUnitIds: cloneStringList(sourceDraw && sourceDraw.unitIds),
                    copiedTargets: copiedTargetDescriptors.length,
                    copiedTargetDescriptors,
                }, extra || {});
            }

    function getSourceDraw(entry) {
                const lifecycle = entry && entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                    ? entry.renderLifecycle
                    : null;
                return lifecycle && lifecycle.sourceDraw && typeof lifecycle.sourceDraw === 'object'
                    ? lifecycle.sourceDraw
                    : null;
            }

    function createProofMaterializationCache() {
                return typeof WeakMap !== 'undefined' ? new WeakMap() : null;
            }

    function materializeCopiedTargetDescriptors(entry, materializationCache = null) {
                if (typeof materializeCopiedRenderTargetsForEntry !== 'function') return [];
                if (materializationCache && entry && typeof entry === 'object') {
                    try {
                        if (materializationCache.has(entry)) return materializationCache.get(entry);
                    } catch (_) {}
                }
                const materializedTargets = materializeCopiedRenderTargetsForEntry(entry);
                const descriptors = Array.isArray(materializedTargets)
                    ? materializedTargets.map(createCopiedTargetDescriptor).filter(Boolean)
                    : [];
                if (materializationCache && entry && typeof entry === 'object') {
                    try { materializationCache.set(entry, descriptors); } catch (_) {}
                }
                return descriptors;
            }

    function getCopiedTargetConflictRects(entry, materializationCache = null) {
                return materializeCopiedTargetDescriptors(entry, materializationCache)
                    .map((descriptor) => ({
                        targetSurfaceId: String(descriptor && descriptor.targetSurfaceId || ''),
                        bounds: cloneRect(descriptor && (descriptor.targetBounds || descriptor.targetRestoreRect) || null),
                    }))
                    .filter((target) => rectHasArea(target.bounds));
            }

    function createCopiedTargetDescriptor(target) {
                if (!target || typeof target !== 'object') return null;
                const restoreMaterial = target.targetRestoreMaterial && typeof target.targetRestoreMaterial === 'object'
                    ? target.targetRestoreMaterial
                    : null;
                return {
                    edgeId: String(target.edgeId || ''),
                    sourceSurfaceId: String(target.sourceSurfaceId || ''),
                    targetSurfaceId: String(target.targetSurfaceId || ''),
                    sourceRunId: String(target.sourceRunId || ''),
                    sourceSlotKey: String(target.sourceSlotKey || ''),
                    targetRevision: readRevision(target.targetRevision),
                    sourceBounds: cloneRect(target.sourceBounds),
                    targetBounds: cloneRect(target.targetBounds || target.bounds),
                    targetRestoreMaterialId: String(
                        target.targetRestoreMaterialId
                        || restoreMaterial && restoreMaterial.materialId
                        || ''
                    ),
                    targetRestoreRevisionBefore: readRevision(
                        target.targetRestoreRevisionBefore
                        || restoreMaterial && restoreMaterial.targetRevisionBefore
                    ),
                    targetRestoreRect: cloneRect(
                        target.targetRestoreRect
                        || restoreMaterial && (restoreMaterial.rect || restoreMaterial.bounds)
                    ),
                };
            }

    function hasImmediateContentsReplacementProof(entry, windowData) {
                const entryRevision = readRevision(entry && entry.contentsRevision);
                const currentRevision = readRevision(windowData && windowData.contentsRevision);
                if (entryRevision === null || currentRevision === null) return false;
                return currentRevision === entryRevision + 1;
            }

    function sameCurrentContentsRevision(candidate, windowData) {
                const candidateRevision = readRevision(candidate && candidate.contentsRevision);
                const currentRevision = readRevision(windowData && windowData.contentsRevision);
                if (candidateRevision === null || currentRevision === null) return false;
                return candidateRevision === currentRevision;
            }

    function sameGeneration(left, right) {
                const leftNumber = readGeneration(left);
                const rightNumber = readGeneration(right);
                return leftNumber !== null && rightNumber !== null && leftNumber === rightNumber;
            }

    function sameText(left, right) {
                const leftText = String(left || '');
                const rightText = String(right || '');
                return !!leftText && leftText === rightText;
            }

    function sameSlotIdentity(left, right) {
                return isSameLogicalDrawSlot(left, right);
            }

    function isContentsInvalidationReason(reason) {
                const text = String(reason || '');
                return text === 'contents-replaced'
                    || text === 'clear-contents'
                    || text === 'clearRect-contents'
                    || /-contents$/u.test(text);
            }

    function readRevision(value) {
                const number = Number(value);
                return Number.isFinite(number) ? Math.floor(number) : null;
            }

    function readGeneration(value) {
                const number = Number(value);
                return Number.isFinite(number) ? Math.floor(number) : null;
            }

    function cloneStringList(value) {
                return (Array.isArray(value) ? value : [])
                    .map((item) => String(item || ''))
                    .filter(Boolean);
            }

    function cloneRect(rect) {
                if (!rect || typeof rect !== 'object') return null;
                const x1 = Number(rect.x1);
                const y1 = Number(rect.y1);
                const x2 = Number(rect.x2);
                const y2 = Number(rect.y2);
                if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
                return { x1, y1, x2, y2 };
            }

    function rectsOverlap(left, right) {
                return !!(left
                    && right
                    && Number(left.x1) < Number(right.x2)
                    && Number(left.x2) > Number(right.x1)
                    && Number(left.y1) < Number(right.y2)
                    && Number(left.y2) > Number(right.y1));
            }

    function rectHasArea(rect) {
                return !!(rect
                    && Number.isFinite(Number(rect.x1))
                    && Number.isFinite(Number(rect.y1))
                    && Number.isFinite(Number(rect.x2))
                    && Number.isFinite(Number(rect.y2))
                    && Number(rect.x2) > Number(rect.x1)
                    && Number(rect.y2) > Number(rect.y1));
            }

    function acceptProof(entry, proof) {
                return {
                    accepted: true,
                    reason: '',
                    entry,
                    proof: proof || null,
                    details: proof || null,
                };
            }

    function rejectProof(reason, details = {}) {
                return {
                    accepted: false,
                    reason: reason || 'detached-proof-rejected',
                    entry: null,
                    proof: null,
                    details,
                };
            }

        return { resolveDetachedRenderTarget };
    }
            return { create: createRenderProofController };
        },
    });
})();
