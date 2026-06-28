// Window text adapter support: subscription controller.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.subscriptionController',
        factory() {

    function createSubscriptionControllerController(context = {}) {
    const { entriesByRecordId, RENDER_STRATEGY, entryLifecycleState } = context;
    const { lifecycle: lifecycleService, surface: surfaceService } = context.services;
    const { entryLifecycle, entryRecords, renderCommands, renderProof, textConversion, textMetrics } = context.facades;
    const { observeEntry, firstNonEmptyString } = entryRecords;
    const { applyRenderCommand, markRequestSkipped, markRequestFailed } = renderCommands;
    const { rememberDetachedEntry, takeDetachedEntry, markRecordDisappeared, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, resolveWindowData } = entryLifecycle;
    const { resolveDetachedRenderTarget } = renderProof;
    const { restoreTranslatedWindowText, sanitizeDrawTextOutput } = textConversion;
    const { getSurfaceId, getWindowTypeName } = textMetrics;

    function installOrchestratorSubscription() {
                lifecycleService.subscribeRecords({
                    token: RENDER_STRATEGY,
                    records: entriesByRecordId,
                    renderStrategy: RENDER_STRATEGY,
                    getRenderGeneration: getRenderGeneration,
                    isRenderTargetCurrent: isRenderTargetCurrent,
                    resolveRecord: resolveSubscriptionRecord,
                    onRenderQueued: applyRenderCommand,
                    onRenderRejected: handleRenderRejected,
                    onMissingRecord(route, event) {
                        handleMissingRecordEvent(route, event);
                    },
                    onSkipped(entry, event) {
                        markRequestSkipped(entry, event.message || 'translation skipped', event.details || null);
                    },
                    onFailed(entry, event) {
                        markRequestFailed(entry, event.message || 'translation failed', event.details || null);
                    },
                    onEvent(entry, event) {
                        const type = event && event.type ? String(event.type) : '';
                        const details = event && event.details && typeof event.details === 'object' ? event.details : {};
                        if (isDetachedStoredTranslationEvent(event, details)) {
                            handleMissingRecordEvent(createDetachedStoredTranslationRoute(event), event);
                            return;
                        }
                        if (type !== 'item.cache_hit'
                            || !details
                            || details.lookupReuse !== true) {
                            return;
                        }
                        const received = firstNonEmptyString(
                            details && details.translationReceived,
                            details && details.translation,
                            details && details.text
                        );
                        if (!received) return;
                        entry.providerText = received;
                        entry.renderedText = restoreTranslatedWindowText(entry, received);
                        entry.translationTimestamp = Date.now();
                        entry.skipReason = '';
                    },
                });
            }

    function createDetachedStoredTranslationRoute(event) {
                const recordId = firstNonEmptyString(event && event.itemId, event && event.id);
                return {
                    recordId,
                    itemId: recordId,
                    eventType: event && event.type ? String(event.type) : '',
                    adapterId: event && event.adapterId ? String(event.adapterId) : '',
                    surfaceId: event && event.surfaceId ? String(event.surfaceId) : '',
                    event,
                    command: null,
                };
            }

    function resolveSubscriptionRecord(recordId, event) {
                if (isDetachedStoredTranslationEvent(event)) return null;
                const entry = entriesByRecordId && typeof entriesByRecordId.get === 'function'
                    ? entriesByRecordId.get(String(recordId || '')) || null
                    : null;
                return entry;
            }

    function handleMissingRecordEvent(route, event) {
                const type = event && event.type ? String(event.type) : '';
                if (type !== 'item.translation_stored') return false;
                const details = event && event.details && typeof event.details === 'object' ? event.details : {};
                if (!isDetachedStoredTranslationEvent(event, details)) return false;
                return renderDetachedTranslation(route, event, details);
            }

    function isDetachedStoredTranslationEvent(event, details = null) {
                if (!event || String(event.type || '') !== 'item.translation_stored') return false;
                const eventDetails = details && typeof details === 'object'
                    ? details
                    : event && event.details && typeof event.details === 'object'
                        ? event.details
                        : {};
                return eventDetails.detached === true || String(event && event.message || '') === 'detached';
            }

    function renderDetachedTranslation(route, event, details) {
                const recordId = firstNonEmptyString(
                    route && route.recordId,
                    route && route.itemId,
                    event && event.itemId,
                    event && event.id
                );
                const entry = takeDetachedEntry(recordId);
                if (!entry) return false;
                const received = firstNonEmptyString(
                    details && details.translationReceived,
                    details && details.translation,
                    details && details.receivedTranslation
                );
                if (!received) {
                    rememberDetachedEntry(entry, 'detached-translation-missing', {
                        key: entry.key || '',
                    });
                    recordDetachedRecoveryDecision(entry, 'detached-translation-missing', {
                        key: entry.key || '',
                    });
                    return false;
                }
                const match = findDetachedTranslationWindow(event, details, entry);
                if (!match || !match.windowInstance || !match.windowData) {
                    rememberDetachedEntry(entry, 'detached-window-missing', {
                        key: entry.key || '',
                    });
                    recordDetachedRecoveryDecision(entry, 'detached-window-missing', {
                        key: entry.key || '',
                        surfaceId: event && event.surfaceId || details && details.surfaceId || '',
                        identitySurfaceId: details && details.metadata && details.metadata.identitySurfaceId || '',
                    });
                    return false;
                }
                const windowInstance = match.windowInstance;
                const windowData = match.windowData;
                const renderTarget = resolveDetachedRenderTarget(entry, windowData, windowInstance);
                if (!renderTarget || renderTarget.accepted !== true || !renderTarget.entry) {
                    recordDetachedRecoveryDecision(entry, renderTarget && renderTarget.reason || 'detached-render-proof-rejected', {
                        key: entry.key || '',
                        windowType: getWindowTypeName(windowInstance, windowData),
                        proof: renderTarget && renderTarget.details || null,
                    });
                    return false;
                }
                const targetEntry = renderTarget.entry;
                const proof = renderTarget.proof || null;
                const reattached = reattachDetachedEntry(targetEntry, windowInstance, windowData, received, route, event, details, proof);
                if (!reattached) {
                    recordDetachedRecoveryDecision(entry, 'detached-reattach-failed', {
                        key: entry.key || '',
                        windowType: getWindowTypeName(windowInstance, windowData),
                        proof,
                    });
                    return false;
                }
                return queueDetachedRecoveryRenderCommand(targetEntry, windowInstance, windowData, received, proof);
            }

    function recordDetachedRecoveryDecision(entry, reason, details = null) {
                if (!entry || !lifecycleService || typeof lifecycleService.recordDecision !== 'function') return null;
                return lifecycleService.recordDecision(entry, 'detached_recovery.rejected', reason || 'detached-recovery-rejected', Object.assign({
                    reason: reason || 'detached-recovery-rejected',
                }, details || {}));
            }

    function queueDetachedRecoveryRenderCommand(entry, windowInstance, windowData, received, proof = null) {
                if (!entry || !lifecycleService || typeof lifecycleService.queueStoredRenderCommand !== 'function') return false;
                const command = lifecycleService.queueStoredRenderCommand(entry, {
                    strategy: RENDER_STRATEGY,
                    text: received,
                    translationReceived: received,
                    generation: entry.surfaceRevision || 0,
                    targetSurfaceId: entry.surfaceId || getSurfaceId(windowData) || '',
                    sourceKind: 'stored',
                    recoveryProof: proof,
                    metadata: {
                        detached: true,
                        renderRoute: 'detached-record',
                        windowType: getWindowTypeName(windowInstance, windowData),
                        method: entry.type || '',
                        key: entry.key || getTextEntryKey(windowData, entry) || '',
                    },
                });
                if (command && command.commandId) return true;
                markRecordDisappeared(entry, 'detached-render-command-queue-failed', {
                    key: entry.key || '',
                    windowType: getWindowTypeName(windowInstance, windowData),
                });
                return false;
            }

    function reattachDetachedEntry(entry, windowInstance, windowData, received, route, event, details, proof = null) {
                if (!entry || !windowInstance || !windowData) return false;
                const restored = restoreTranslatedWindowText(entry, received);
                const rendered = sanitizeDrawTextOutput(restored, entry.type);
                if (!rendered || rendered.trim() === String(entry.convertedText || '').trim()) return false;
                const key = getTextEntryKey(windowData, entry);
                if (!key || !windowData.texts) return false;
                entryLifecycleState.markReattached(entry);
                entry.key = key;
                entry.ownerWindow = windowInstance;
                entry.windowData = windowData;
                entry.contentsBitmap = windowInstance.contents || entry.contentsBitmap;
                entry.contentsRevision = windowData.contentsRevision || 0;
                entry.surfaceId = getSurfaceId(windowData) || entry.surfaceId;
                entry.identitySurfaceId = firstNonEmptyString(
                    entry.identitySurfaceId,
                    details && details.metadata && details.metadata.identitySurfaceId
                );
                entry.providerText = received;
                entry.renderedText = rendered;
                entry.translationTimestamp = Date.now();
                entry.surfaceRevision = (Number(entry.surfaceRevision) || 0) + 1;
                entry.detachedRenderProof = proof || null;
                clearPendingInvalidation(entry);
                try { windowData.texts.set(key, entry); } catch (_) { return false; }
                observeEntry(windowData, entry, 'completed', {
                    eventType: 'item.observed',
                    message: 'detached-record-restored',
                    replace: false,
                    details: {
                        detached: true,
                        renderRoute: 'detached-record',
                        commandId: route && route.commandId || '',
                        eventType: event && event.type || '',
                        renderProof: proof,
                    },
                });
                return true;
            }

    function findDetachedTranslationWindow(event, details, entry = null) {
                const metadata = details && details.metadata && typeof details.metadata === 'object'
                    ? details.metadata
                    : {};
                const identitySurfaceId = firstNonEmptyString(
                    metadata.identitySurfaceId,
                    details && details.identitySurfaceId,
                    entry && entry.identitySurfaceId
                );
                const surfaceId = firstNonEmptyString(
                    event && event.surfaceId,
                    details && details.surfaceId,
                    metadata.surfaceId,
                    entry && entry.surfaceId
                );
                const entryWindow = entry && entry.ownerWindow ? entry.ownerWindow : null;
                const entryMatch = matchDetachedWindowCandidate(entryWindow, identitySurfaceId, surfaceId);
                if (entryMatch) return entryMatch;
                if (!identitySurfaceId && !surfaceId) return null;
                let match = null;
                try {
                    surfaceService.forEachRegisteredWindow((candidate) => {
                        if (match || !candidate) return;
                        match = matchDetachedWindowCandidate(candidate, identitySurfaceId, surfaceId);
                    });
                } catch (_) {}
                return match;
            }

    function matchDetachedWindowCandidate(candidate, identitySurfaceId, surfaceId) {
                if (!candidate) return null;
                const data = surfaceService.getWindowData(candidate);
                if (!data || data._trUnregistered || candidate._destroyed || candidate.destroyed) return null;
                const candidateSurfaceId = getSurfaceId(data);
                const candidateIdentitySurfaceId = firstNonEmptyString(data.identitySurfaceId, candidateSurfaceId);
                if ((identitySurfaceId
                        && (candidateIdentitySurfaceId === identitySurfaceId || candidateSurfaceId === identitySurfaceId))
                    || (surfaceId
                        && (candidateSurfaceId === surfaceId || candidateIdentitySurfaceId === surfaceId))) {
                    return { windowInstance: candidate, windowData: data };
                }
                return null;
            }
    
    function getRenderGeneration(entry) {
                return entry && entry.surfaceRevision ? Number(entry.surfaceRevision) : 0;
            }
    
    function isRenderTargetCurrent(entry) {
                if (!entry || entryLifecycleState.isStale(entry)) return false;
                const windowData = resolveWindowData(entry);
                return !!(windowData && getCurrentEntry(windowData, entry) === entry);
            }
    
    function handleRenderRejected(entry, decision) {
                if (!entry || !decision || decision.reason !== 'target-not-current') return;
                const windowData = resolveWindowData(entry);
                markRecordDisappeared(entry, 'window-entry-replaced', {
                    key: entry.key || '',
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                    commandId: decision.commandId || '',
                });
            }
    
        return { installOrchestratorSubscription, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected };
    }
            return { create: createSubscriptionControllerController };
        },
    });

})();
