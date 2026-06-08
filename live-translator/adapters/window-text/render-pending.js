// Window text adapter support: render pending.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/render-pending.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/window-text/render-pending.js.');
    }
    const renderTransaction = requireRuntimeModule('runtime.renderTransaction');

    function createRenderPendingController(context = {}) {
        const { ADAPTER_ID, RENDER_STRATEGY, entryLifecycleState } = context;
        const { lifecycle: lifecycleService } = context.services;
        const {
            diagnostics,
            entryLifecycle,
            renderDraw,
            renderQueue,
            renderReadiness,
            textConversion,
        } = context.facades;
        const { recordDecision } = diagnostics;
        const { markRecordDisappeared, resolveWindowData } = entryLifecycle;
        const { drawTranslatedEntry } = renderDraw;
        const { queueRenderRetry, dropRenderRetry } = renderQueue;
        const { planTranslatedRedraw } = renderReadiness;
        const { restoreTranslatedWindowText } = textConversion;

    function applyRenderCommand(entry, command, route = {}) {
                const windowData = resolveWindowData(entry);
                if (!windowData) return false;
    
                const received = typeof command.text === 'string' ? command.text : '';
                const restored = restoreTranslatedWindowText(entry, received);
                entry.providerText = received;
    
                if (!restored || restored.trim() === String(entry.convertedText || '').trim()) {
                    const reason = restored ? 'translated-text-matched-original' : 'restored-text-empty';
                    entry.renderedText = '';
                    entry.skipReason = '';
                    return renderTransaction.createRenderCommit({
                        status: 'rejected',
                        mode: 'window-restore',
                        reason,
                        adapterId: ADAPTER_ID,
                        itemId: entry.recordId || '',
                        recordId: entry.recordId || '',
                        surfaceId: entry.surfaceId || '',
                        slotKey: entry.slotKey || '',
                        strategy: route && route.strategy || RENDER_STRATEGY,
                        commandId: command && command.id || '',
                        commandGeneration: route && route.commandGeneration || command && command.generation || 0,
                        generation: entry.surfaceRevision || 0,
                        translationReceived: received,
                        translationDrawn: '',
                        details: {
                            windowType: windowData.windowType || '',
                            translationReceived: received,
                            restoredText: restored || '',
                        },
                    });
                }
    
                entry.renderedText = restored;
                entry.translationTimestamp = Date.now();
                const admitted = beginPendingRenderCommand(entry, command, route, received, restored);
                const renderResult = redrawTranslatedText(entry, windowData);
                if (renderResult && renderResult.status === 'deferred') {
                    const deferred = markPendingRenderDeferred(entry, renderResult.reason || 'window-redraw-deferred', Object.assign({
                        windowType: windowData.windowType || '',
                        translationReceived: received,
                        translationDrawn: restored,
                    }, renderResult.details || {}));
                    return deferred && deferred.commit ? deferred.commit : renderTransaction.createRenderCommit({
                        status: 'deferred',
                        mode: 'async-redraw',
                        reason: renderResult.reason || 'window-redraw-deferred',
                        adapterId: ADAPTER_ID,
                        itemId: entry.recordId || '',
                        recordId: entry.recordId || '',
                        surfaceId: entry.surfaceId || '',
                        slotKey: entry.slotKey || '',
                        strategy: route && route.strategy || RENDER_STRATEGY,
                        commandId: command && command.id || '',
                        commandGeneration: route && route.commandGeneration || command && command.generation || 0,
                        generation: entry.surfaceRevision || 0,
                        translationReceived: received,
                        translationDrawn: restored,
                        details: getPendingRenderDetails(entry),
                    });
                }
                if (renderResult && renderResult.status === 'accepted') {
                    return renderTransaction.createRenderCommit({
                        status: 'accepted',
                        mode: 'async-redraw',
                        reason: renderResult.reason || 'rendered',
                        adapterId: ADAPTER_ID,
                        itemId: entry.recordId || '',
                        recordId: entry.recordId || '',
                        surfaceId: entry.surfaceId || '',
                        slotKey: entry.slotKey || '',
                        strategy: route && route.strategy || RENDER_STRATEGY,
                        commandId: command && command.id || '',
                        commandGeneration: route && route.commandGeneration || command && command.generation || 0,
                        generation: entry.surfaceRevision || 0,
                        translationReceived: received,
                        translationDrawn: restored,
                        details: renderResult.details || {},
                    });
                }
                clearPendingRenderCommand(entry);
                return renderTransaction.createRenderCommit({
                    status: 'rejected',
                    mode: 'async-redraw',
                    reason: renderResult && renderResult.reason || admitted && admitted.reason || 'window-redraw-missed',
                    adapterId: ADAPTER_ID,
                    itemId: entry.recordId || '',
                    recordId: entry.recordId || '',
                    surfaceId: entry.surfaceId || '',
                    slotKey: entry.slotKey || '',
                    strategy: route && route.strategy || RENDER_STRATEGY,
                    commandId: command && command.id || '',
                    commandGeneration: route && route.commandGeneration || command && command.generation || 0,
                    generation: entry.surfaceRevision || 0,
                    translationReceived: received,
                    translationDrawn: restored,
                    details: renderResult && renderResult.details || {},
                });
            }
    
    function markRequestSkipped(entry, reason, details = null) {
                if (!entry || entryLifecycleState.isStale(entry)) return;
                const windowData = resolveWindowData(entry);
                entry.skipReason = reason || 'translation skipped';
            }
    
    function markRequestFailed(entry, message, details = null) {
                if (!entry) return;
            }
    
    function updateOrchestratorItem(entry, patch, eventType, details = null) {
                return lifecycleService.updateItem(entry, patch, eventType, details);
            }
    
    function beginPendingRenderCommand(entry, command, route, received, restored) {
                if (!entry || !command) {
                    return createPendingRenderTransitionResult('ignored', 'missing-render-command', null, entry);
                }
                const known = renderTransaction.noteTranslationKnown({
                    adapterId: ADAPTER_ID,
                    itemId: entry.recordId || '',
                    recordId: entry.recordId || '',
                    surfaceId: entry.surfaceId || '',
                    slotKey: entry.slotKey || '',
                    strategy: route && route.strategy ? String(route.strategy) : RENDER_STRATEGY,
                    commandId: command.id ? String(command.id) : '',
                    commandGeneration: Number(route && route.commandGeneration) || Number(command.generation) || 0,
                    generation: Number(entry.surfaceRevision) || 0,
                    translationReceived: typeof received === 'string' ? received : '',
                    translationDrawn: typeof restored === 'string' ? restored : '',
                    drawBoundary: entry.renderLifecycle && entry.renderLifecycle.sourceDraw
                        ? entry.renderLifecycle.sourceDraw
                        : null,
                    details: {
                        method: entry.type || '',
                    },
                });
                const admitted = renderTransaction.admitRender(known.state, {
                    reason: 'render-command-admitted',
                });
                entry.renderTransaction = admitted.state;
                return createPendingRenderTransitionResult('admitted', 'render-command-admitted', admitted, entry);
            }
    
    function markPendingRenderDeferred(entry, reason, details = null) {
                const pending = entry && entry.renderTransaction;
                if (!pending) {
                    return createPendingRenderTransitionResult('ignored', 'missing-pending-render', null, entry);
                }
                const deferred = renderTransaction.deferRender(pending, {
                    reason: reason || 'window-redraw-deferred',
                    mode: 'async-redraw',
                    details: Object.assign({}, pending.details || {}, details || {}),
                });
                entry.renderTransaction = deferred.state;
                const event = lifecycleService.recordRenderDeferred(entry, {
                    commandId: deferred.state.commandId,
                    strategy: deferred.state.strategy,
                    commandGeneration: deferred.state.commandGeneration,
                    reason: deferred.state.reason || reason || 'window-redraw-deferred',
                    details: getPendingRenderDetails(entry),
                    renderCommit: deferred.commit,
                });
                return createPendingRenderTransitionResult('deferred', deferred.state.reason || reason || 'window-redraw-deferred', deferred, entry, {
                    event,
                });
            }
    
    function completePendingRenderCommand(entry, details = null) {
                const pending = entry && entry.renderTransaction;
                const rendered = entry && entry.renderedText || pending && pending.translationDrawn || '';
                const renderDetails = Object.assign({}, pending ? getPendingRenderDetails(entry) : {}, details || {}, {
                    translationReceived: pending && pending.translationReceived || entry && entry.providerText || '',
                    translationDrawn: rendered,
                });
                const acceptedTransition = pending
                    ? renderTransaction.commitRender(pending, {
                        mode: details && details.renderMode || 'async-redraw',
                        reason: 'rendered',
                        translationDrawn: rendered,
                        translationReceived: renderDetails.translationReceived,
                        details: renderDetails,
                    })
                    : null;
                const accepted = acceptedTransition
                    ? acceptedTransition.commit
                    : renderTransaction.createRenderCommit({
                        status: 'accepted',
                        mode: details && details.renderMode || 'native-substitution',
                        reason: 'rendered',
                        adapterId: ADAPTER_ID,
                        itemId: entry && entry.recordId || '',
                        recordId: entry && entry.recordId || '',
                        surfaceId: entry && entry.surfaceId || '',
                        slotKey: entry && entry.slotKey || '',
                        strategy: RENDER_STRATEGY,
                        generation: entry && entry.surfaceRevision || 0,
                        translationReceived: renderDetails.translationReceived,
                        translationDrawn: rendered,
                        details: renderDetails,
                    });
                if (!pending) {
                    return createPendingRenderTransitionResult('accepted', 'rendered', null, entry, {
                        commit: accepted,
                        details: renderDetails,
                    });
                }
                updateOrchestratorItem(entry, {
                    status: 'completed',
                    translation: rendered,
                    translationDrawn: rendered,
                }, 'item.rendered', renderDetails);
                let event = null;
                if (pending.deferred === true) {
                    event = lifecycleService.recordRenderAccepted(entry, {
                        commandId: pending.commandId,
                        strategy: pending.strategy,
                        commandGeneration: pending.commandGeneration,
                        reason: 'rendered',
                        details: renderDetails,
                        renderCommit: accepted,
                    });
                }
                dropRenderRetry(resolveWindowData(entry), entry);
                clearPendingRenderCommand(entry);
                return createPendingRenderTransitionResult('accepted', 'rendered', acceptedTransition, entry, {
                    commit: accepted,
                    details: renderDetails,
                    event,
                });
            }
    
    function rejectPendingRender(entry, reason = 'window-redraw-rejected', details = null) {
                const pending = entry && entry.renderTransaction;
                if (!pending) {
                    return createPendingRenderTransitionResult('ignored', 'missing-pending-render', null, entry);
                }
                const rejected = renderTransaction.rejectRender(pending, {
                    mode: 'async-redraw',
                    reason,
                    details: Object.assign({}, getPendingRenderDetails(entry), details || {}),
                });
                entry.renderTransaction = rejected.state;
                const event = lifecycleService.recordRenderRejected(entry, {
                    commandId: rejected.state.commandId,
                    strategy: rejected.state.strategy,
                    commandGeneration: rejected.state.commandGeneration,
                    reason,
                    details: Object.assign({}, getPendingRenderDetails(entry), details || {}),
                    renderCommit: rejected.commit,
                });
                clearPendingRenderCommand(entry);
                return createPendingRenderTransitionResult('rejected', reason, rejected, entry, {
                    event,
                });
            }
    
    function clearPendingRenderCommand(entry) {
                if (entry) delete entry.renderTransaction;
            }
    
    function getPendingRenderDetails(entry) {
                const pending = entry && entry.renderTransaction;
                return Object.assign({}, pending && pending.details || {}, {
                    renderPhase: pending && pending.phase || '',
                    transactionId: pending && pending.id || '',
                    commandId: pending && pending.commandId || '',
                    strategy: pending && pending.strategy || RENDER_STRATEGY,
                    commandGeneration: pending && pending.commandGeneration || 0,
                    deferred: pending && pending.deferred === true,
                    translationReceived: pending && pending.translationReceived || '',
                    translationDrawn: pending && pending.translationDrawn || '',
                });
            }

    function createPendingRenderTransitionResult(status, reason, transition = null, entry = null, extras = {}) {
                const source = extras && typeof extras === 'object' ? extras : {};
                const state = transition && transition.state ? transition.state : (source.state || null);
                const commit = transition && transition.commit ? transition.commit : (source.commit || null);
                const normalizedStatus = String(status || '');
                return Object.freeze({
                    status: normalizedStatus,
                    handled: normalizedStatus !== 'ignored',
                    accepted: normalizedStatus === 'admitted'
                        || normalizedStatus === 'deferred'
                        || normalizedStatus === 'accepted',
                    terminal: normalizedStatus === 'accepted' || normalizedStatus === 'rejected',
                    reason: String(reason || commit && commit.reason || state && state.reason || normalizedStatus),
                    phase: state && state.phase ? state.phase : (commit && commit.phase ? commit.phase : ''),
                    previousPhase: transition && transition.previousPhase ? transition.previousPhase : '',
                    state,
                    commit,
                    event: source.event || null,
                    details: source.details && typeof source.details === 'object'
                        ? source.details
                        : (commit && commit.details ? commit.details : {}),
                    recordId: entry && entry.recordId ? String(entry.recordId) : '',
                    surfaceId: entry && entry.surfaceId ? String(entry.surfaceId) : '',
                    slotKey: entry && entry.slotKey ? String(entry.slotKey) : '',
                    commandId: state && state.commandId ? state.commandId : (commit && commit.commandId || ''),
                    commandGeneration: state && Number.isFinite(Number(state.commandGeneration))
                        ? Number(state.commandGeneration)
                        : (commit && Number.isFinite(Number(commit.commandGeneration)) ? Number(commit.commandGeneration) : 0),
                });
            }
    
            function redrawTranslatedText(entry, windowData) {
                const plan = planTranslatedRedraw(entry, windowData);
                if (!plan || plan.action === 'reject') {
                    return handleRejectedRenderPlan(entry, plan);
                }
                if (plan.action === 'defer') {
                    const details = Object.assign({}, plan.details || {}, {
                        queue: plan.queue || '',
                    });
                    recordDecision(entry, 'draw.deferred', describeDeferReason(plan.reason), details);
                    queueRenderRetry(plan.targetWindow, plan.windowData, entry, plan.textKey, plan);
                    return createRenderResult('deferred', plan.reason || 'window-redraw-deferred', details);
                }
                dropRenderRetry(plan.windowData, entry, plan.textKey);
                const drawResult = drawTranslatedEntry(plan.targetWindow, plan.windowData, plan.contents, entry);
                if (drawResult && typeof drawResult === 'object' && drawResult.status) return drawResult;
                if (drawResult === true) return createRenderResult('accepted', 'rendered', {});
                return createRenderResult('missed', 'window-redraw-missed', plan.details || {});
            }

    function handleRejectedRenderPlan(entry, plan) {
                const reason = plan && plan.reason ? plan.reason : 'window-redraw-rejected';
                const details = plan && plan.details ? plan.details : null;
                if (reason === 'window-entry-stale') {
                    rejectPendingRender(entry, reason, details);
                    return createRenderResult('rejected', reason, details);
                }
                if (reason === 'window-redraw-target-missing' || reason === 'window-entry-replaced') {
                    const windowData = resolveWindowData(entry);
                    dropRenderRetry(windowData, entry, details && details.textKey);
                    markRecordDisappeared(entry, reason, details);
                    return createRenderResult('rejected', reason, details);
                }
                rejectPendingRender(entry, reason, details);
                return createRenderResult('rejected', reason, details);
            }

    function createRenderResult(status, reason = '', details = null) {
                return {
                    status: String(status || ''),
                    reason: String(reason || ''),
                    details: details && typeof details === 'object' ? details : {},
                };
            }

    function describeDeferReason(reason) {
                if (reason === 'native-source-draw-pending') return 'waiting for native source draw';
                if (reason === 'active-refresh-transaction') return 'waiting for active window refresh';
                if (reason === 'window-not-ready') return 'waiting for drawable window';
                if (reason === 'render-drain-not-active') return 'waiting for window render drain';
                if (reason === 'window-redraw-invalidated') return 'waiting for window redraw revalidation';
                return reason || 'window redraw deferred';
            }
    
        return { applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred, completePendingRenderCommand, rejectPendingRender, clearPendingRenderCommand, getPendingRenderDetails, redrawTranslatedText };
    }
    
    defineRuntimeModule('adapters.windowTextRenderPending', { create: createRenderPendingController });

})();
