// Window text adapter support: detached render proof.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/render-proof.js.');
    }

    function createRenderProofController(context = {}) {
    const { entryLifecycleState } = context;
    const { entryRecords, textMetrics } = context.facades;
    const { firstNonEmptyString } = entryRecords;
    const { createSlotKey, getSurfaceId } = textMetrics;

    function resolveDetachedRenderTarget(entry, windowData, windowInstance) {
                if (!entry || !windowData || !windowInstance) {
                    return rejectProof('detached-render-target-missing', createProofDetails(entry, windowData, null));
                }

                const reason = getDetachedInvalidationReason(entry);
                if (isObsoleteDetachedEntry(entry, reason)) {
                    return rejectProof('detached-entry-obsolete', createProofDetails(entry, windowData, null, {
                        reason,
                    }));
                }

                if (!requiresExplicitDetachedProof(reason)) {
                    const conflict = findSlotConflict(windowData, entry);
                    if (conflict) {
                        return rejectSlotConflict(entry, windowData, conflict, reason);
                    }
                    return acceptProof(entry, createDetachedRecordProof(entry, windowData, reason));
                }

                const currentEntry = findCurrentSourceEntry(windowData, entry);
                if (currentEntry) {
                    const conflict = findSlotConflict(windowData, currentEntry);
                    if (conflict) {
                        return rejectSlotConflict(currentEntry, windowData, conflict, reason);
                    }
                    return acceptProof(currentEntry, createCurrentSourceProof(entry, currentEntry, windowData, reason));
                }

                const replacement = createImmediateContentsReplacementProof(entry, windowInstance, windowData, reason);
                if (!replacement.accepted) return replacement;
                const conflict = findSlotConflict(windowData, entry);
                if (conflict) {
                    return rejectSlotConflict(entry, windowData, conflict, reason);
                }
                return acceptProof(entry, replacement.proof);
            }

    function createDetachedRecordProof(entry, windowData, reason) {
                return Object.assign(createProofDetails(entry, windowData, 'detached-record', {
                    reason,
                }), {
                    type: 'detached-record',
                });
            }

    function createCurrentSourceProof(detachedEntry, currentEntry, windowData, reason) {
                const sourceDraw = getSourceDraw(currentEntry);
                return Object.assign(createProofDetails(currentEntry, windowData, 'current-source', {
                    reason,
                    sourceRecordId: detachedEntry && detachedEntry.recordId || '',
                    sourceContentsRevision: readRevision(detachedEntry && detachedEntry.contentsRevision),
                    sourceDrawPhase: sourceDraw && sourceDraw.phase || '',
                    sourceCommitted: sourceDraw && sourceDraw.sourceCommitted === true,
                    sourceDrawGeneration: readGeneration(sourceDraw && sourceDraw.entryGeneration),
                }), {
                    type: 'current-source',
                });
            }

    function createImmediateContentsReplacementProof(entry, windowInstance, windowData, reason) {
                const details = createProofDetails(entry, windowData, 'immediate-contents-replacement', {
                    reason,
                });
                if (entry.type !== 'drawTextEx') {
                    return rejectProof('detached-proof-method-unsupported', details);
                }
                if (windowData._trUnregistered || windowInstance._destroyed || windowInstance.destroyed) {
                    return rejectProof('detached-proof-window-unavailable', details);
                }
                if (entry.ownerWindow && entry.ownerWindow !== windowInstance) {
                    return rejectProof('detached-proof-owner-mismatch', details);
                }
                if (entry.requiresCopiedTarget === true || entry.sourceContentsRole === 'window-staging-contents') {
                    return rejectProof('detached-proof-requires-copied-target', details);
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
                if (!sameText(sourceDraw.slotKey, entry.slotKey)) {
                    return rejectProof('detached-proof-slot-mismatch', details);
                }
                if (!sameGeneration(sourceDraw.entryGeneration, entry.surfaceRevision)) {
                    return rejectProof('detached-proof-generation-mismatch', details);
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
                        if (getEntrySlotKey(candidate) !== expectedSlot) return;
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

    function findSlotConflict(windowData, entry) {
                if (!windowData || !windowData.texts || !entry) return null;
                const slotKey = getEntrySlotKey(entry);
                let conflict = null;
                try {
                    windowData.texts.forEach((candidate) => {
                        if (conflict || !candidate || candidate === entry || entryLifecycleState.isStale(candidate)) return;
                        if (getEntrySlotKey(candidate) === slotKey) conflict = candidate;
                    });
                } catch (_) {}
                return conflict;
            }

    function rejectSlotConflict(entry, windowData, conflict, reason) {
                return rejectProof('detached-proof-slot-conflict', createProofDetails(entry, windowData, null, {
                    reason,
                    conflictRecordId: conflict && conflict.recordId || '',
                    conflictSlotKey: getEntrySlotKey(conflict),
                    conflictContentsRevision: readRevision(conflict && conflict.contentsRevision),
                }));
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

    function createProofDetails(entry, windowData, type, extra = {}) {
                const sourceDraw = getSourceDraw(entry);
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
                    sourceDrawPhase: sourceDraw && sourceDraw.phase || '',
                    sourceCommitted: sourceDraw && sourceDraw.sourceCommitted === true,
                    sourceDrawGeneration: readGeneration(sourceDraw && sourceDraw.entryGeneration),
                    copiedTargets: countCopiedTargets(entry),
                }, extra || {});
            }

    function getEntrySlotKey(entry) {
                if (!entry) return '';
                return entry.slotKey || createSlotKey(
                    entry.type,
                    entry.position && entry.position.x,
                    entry.position && entry.position.y,
                    entry.originalParams
                );
            }

    function getSourceDraw(entry) {
                const lifecycle = entry && entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                    ? entry.renderLifecycle
                    : null;
                return lifecycle && lifecycle.sourceDraw && typeof lifecycle.sourceDraw === 'object'
                    ? lifecycle.sourceDraw
                    : null;
            }

    function countCopiedTargets(entry) {
                return entry && Array.isArray(entry._trCopiedRenderTargets)
                    ? entry._trCopiedRenderTargets.filter((target) => target && target.targetBitmap).length
                    : 0;
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

    defineRuntimeModule('adapters.windowTextRenderProof', { create: createRenderProofController });
})();
