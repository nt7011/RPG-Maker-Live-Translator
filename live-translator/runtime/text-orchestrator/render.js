// Text orchestrator support: render.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.render',
        factory() {
            function createController(scope = {}) {
                const { firstString, firstNonEmptyString, finiteNumber, normalizeBounds, pickSerializableObject, cloneEventDetails, normalizeId, renderCommandLimit, activeItems, renderCommands, renderTransaction } = scope;
                const { markTranslationNoop } = scope.controllerFacades.translationState;
                const { markItemRenderCycleAdmitted, markItemRenderCycleDecision, getItemById } = scope.controllerFacades.items;
                const { recordEvent } = scope.controllerFacades.events;
                const { isTranslationNoopRenderRejection } = scope.controllerFacades.sourceCache;

                /**
                 * Queue a render instruction for the adapter that owns an item.
                 *
                 * The orchestrator owns this command until an adapter reports a terminal
                 * outcome. Adapter-local retry schedules may remember the command id, but
                 * the command status here remains the source of truth for dispatch.
                 * Subscribers still receive item.render_queued for compatibility; that
                 * event means "execute this ready command", not "render succeeded".
                 */
                function queueRenderCommand(itemId, command = {}) {
                    const item = activeItems.get(String(itemId || '')) || null;
                    if (!item) return null;
                    const text = firstString(command.text, item.translation, item.translationDrawn);
                    let commandId = firstString(command.commandId, command.id);
                    if (!commandId) commandId = `render:${++scope.renderSequence}`;
                    const now = Date.now();
                    const renderCommand = {
                        commandId,
                        // Legacy alias: adapters still read command.id from item.render_queued.
                        // Remove after all render paths consume commandId directly.
                        id: commandId,
                        itemId: item.id,
                        surfaceId: item.surfaceId || '',
                        targetSurfaceId: firstString(command.targetSurfaceId, command.surfaceId, item.surfaceId),
                        strategy: firstString(command.strategy, item.renderStrategy),
                        text,
                        generation: finiteNumber(command.generation) || item.generation || 0,
                        renderIntent: firstString(command.renderIntent, command.intent, command.metadata && command.metadata.renderIntent),
                        sourceKind: firstString(command.sourceKind, command.source, command.metadata && command.metadata.sourceKind, command.metadata && command.metadata.sourceHint),
                        recoveryProof: normalizeRenderRecoveryProof(command.recoveryProof || command.renderProof || command.metadata && command.metadata.recoveryProof),
                        bounds: normalizeBounds(command.bounds) || (item.bounds ? Object.assign({}, item.bounds) : null),
                        metadata: pickSerializableObject(command.metadata || {}),
                        status: normalizeQueuedRenderCommandStatus(command.status),
                        resumeWhen: normalizeRenderResumeWhen(command.resumeWhen),
                        retryCount: finiteNumber(command.retryCount) || 0,
                        dispatchCount: finiteNumber(command.dispatchCount) || 0,
                        terminal: false,
                        lastOutcome: null,
                        createdAt: now,
                        queuedAt: now,
                        updatedAt: now,
                    };
                    renderCommands.push(renderCommand);
                    while (renderCommands.length > renderCommandLimit) renderCommands.shift();
                    markItemRenderCycleAdmitted(item, renderCommand);
                    publishReadyRenderCommand(item, renderCommand);
                    return cloneRenderCommand(renderCommand);
                }

                function queueStoredRenderCommand(itemId, recovery = {}) {
                    const item = activeItems.get(String(itemId || '')) || null;
                    if (!item) return null;
                    const source = recovery && typeof recovery === 'object' ? recovery : {};
                    const text = firstString(
                        source.text,
                        source.translation,
                        source.translationReceived,
                        item.translationReceived,
                        item.translation,
                        item.translationDrawn
                    );
                    const strategy = firstString(source.strategy, item.translationRenderStrategy, item.renderStrategy);
                    if (!text || !strategy) return null;
                    const renderIntent = firstString(source.renderIntent, source.intent, 'detached-recovery');
                    const sourceKind = firstString(source.sourceKind, source.sourceHint, item.sourceHint, 'stored');
                    const recoveryProof = normalizeRenderRecoveryProof(source.recoveryProof || source.renderProof);
                    const metadata = Object.assign({}, pickSerializableObject(source.metadata || {}), {
                        renderIntent,
                        sourceKind,
                        sourceHint: sourceKind,
                        translationReceived: text,
                    });
                    if (recoveryProof) metadata.recoveryProof = recoveryProof;
                    return queueRenderCommand(item.id, {
                        strategy,
                        text,
                        generation: finiteNumber(source.generation) || item.generation || 0,
                        targetSurfaceId: firstString(source.targetSurfaceId, source.surfaceId, item.surfaceId),
                        renderIntent,
                        sourceKind,
                        recoveryProof,
                        metadata,
                    });
                }

                function recordRenderCommitted(id, decision = {}) {
                    return recordRenderCommandDecision('committed', id, decision);
                }

                function recordRenderDeferred(id, decision = {}) {
                    return recordRenderCommandDecision('deferred', id, decision);
                }

                function recordRenderRejected(id, decision = {}) {
                    return recordRenderCommandDecision('rejected', id, decision);
                }

                function recordRenderCommandDecision(status, id, decision = {}) {
                    const normalizedStatus = normalizeRenderCommandStatus(status);
                    const source = decision && typeof decision === 'object' ? decision : {};
                    const key = normalizeId(id || source.itemId || source.recordId);
                    const item = getItemById(key);
                    if (!item) return null;
                    const command = findRenderCommand(item.id, firstString(source.commandId, source.id));
                    const details = normalizeRenderCommandDecision(normalizedStatus, source, item, command);
                    updateRenderCommandStatus(command, normalizedStatus, details);
                    markItemRenderCycleDecision(item, normalizedStatus, details, command);
                    const event = recordEvent(getRenderCommandDecisionEventType(normalizedStatus), item, {
                        message: details.reason,
                        details,
                    });
                    if (normalizedStatus === 'rejected' && isTranslationNoopRenderRejection(details)) {
                        markTranslationNoop(item.id, firstNonEmptyString(
                            details.details && details.details.translationReceived,
                            command && command.text,
                            item.translationReceived,
                            item.translation
                        ), {
                            reason: details.reason,
                            category: 'renderRejected',
                            sourceHint: firstString(details.details && details.details.sourceHint, item.sourceHint),
                            commandId: details.commandId,
                            strategy: details.strategy,
                            commandGeneration: details.commandGeneration,
                            metadata: {
                                translationFailureReason: details.reason,
                                translationFailureCategory: 'renderRejected',
                            },
                            translationReceived: details.details && details.details.translationReceived,
                        });
                    }
                    return event;
                }

                function notifyRenderCommandReady(commandId, details = {}) {
                    const normalizedCommandId = normalizeId(commandId && typeof commandId === 'object'
                        ? firstString(commandId.commandId, commandId.id)
                        : commandId);
                    if (!normalizedCommandId) {
                        return createRenderCommandReadinessResult('missing-command-id', null, null, 'render-command-id-required', false, true);
                    }
                    const command = findRenderCommand('', normalizedCommandId);
                    if (!command) {
                        return createRenderCommandReadinessResult('missing-command', null, null, 'render-command-missing', false, true, normalizedCommandId);
                    }
                    const item = getItemById(command.itemId);
                    if (!item) {
                        return createRenderCommandReadinessResult('missing-item', null, command, 'render-item-missing', false, true);
                    }
                    if (!isRenderCommandUnresolved(command)) {
                        return createRenderCommandReadinessResult('terminal-command', item, command, 'render-command-terminal', false, true);
                    }
                    const source = details && typeof details === 'object' ? details : {};
                    if (!isRenderCommandDeferred(command)) {
                        const reason = 'render-command-not-deferred';
                        recordRenderReadinessAnomaly(item, command, reason, source);
                        return createRenderCommandReadinessResult('unexpected-command-state', item, command, reason, false, false);
                    }
                    const readiness = pickSerializableObject(source);
                    const now = Date.now();
                    command.status = 'ready';
                    command.resumeWhen = null;
                    command.retryCount = (finiteNumber(command.retryCount) || 0) + 1;
                    command.readyAt = now;
                    command.updatedAt = now;
                    command.readiness = readiness;
                    command.terminal = false;
                    recordEvent('item.render_retry_ready', item, {
                        message: firstString(source.reason, 'render-command-ready'),
                        details: Object.assign({
                            commandId: command.commandId || command.id,
                            retryCount: command.retryCount,
                        }, readiness),
                    });
                    publishReadyRenderCommand(item, command);
                    return createRenderCommandReadinessResult('ready', item, command, firstString(source.reason, 'render-command-ready'), true, false);
                }

                function recordRenderReadinessAnomaly(item, command, reason, source = {}) {
                    const readiness = pickSerializableObject(source || {});
                    recordEvent('item.render_readiness_anomaly', item, {
                        message: reason,
                        details: Object.assign({}, readiness, {
                            reason,
                            wakeReason: firstString(source && source.reason),
                            commandId: firstString(command && command.commandId, command && command.id),
                            commandStatus: firstString(command && command.status),
                            expectedStatus: 'deferred',
                            retryCount: finiteNumber(command && command.retryCount) || 0,
                            dispatchCount: finiteNumber(command && command.dispatchCount) || 0,
                            resumeWhen: normalizeRenderResumeWhen(command && command.resumeWhen),
                        }),
                    });
                }

                function rejectOpenRenderCommands(item, reason, details = null) {
                    if (!item || !item.id) return 0;
                    let rejected = 0;
                    for (let index = renderCommands.length - 1; index >= 0; index -= 1) {
                        const command = renderCommands[index];
                        if (!command || command.itemId !== item.id) continue;
                        if (!isRenderCommandUnresolved(command)) continue;
                        const decision = normalizeRenderCommandDecision('rejected', {
                            commandId: command.commandId || command.id,
                            reason: firstString(reason, 'item-retired'),
                            details,
                        }, item, command);
                        updateRenderCommandStatus(command, 'rejected', decision);
                        markItemRenderCycleDecision(item, 'rejected', decision, command);
                        recordEvent('item.render_rejected', item, {
                            message: decision.reason,
                            details: decision,
                        });
                        rejected += 1;
                    }
                    return rejected;
                }

                function findRenderCommand(itemId, commandId = '') {
                    const normalizedItemId = normalizeId(itemId);
                    const normalizedCommandId = normalizeId(commandId);
                    for (let index = renderCommands.length - 1; index >= 0; index -= 1) {
                        const command = renderCommands[index];
                        if (!command) continue;
                        if (normalizedCommandId
                            && (command.commandId === normalizedCommandId || command.id === normalizedCommandId)) return command;
                        if (!normalizedCommandId && normalizedItemId && command.itemId === normalizedItemId) return command;
                    }
                    return null;
                }

                function getUnresolvedRenderCommandsForItem(itemId) {
                    const normalizedItemId = normalizeId(itemId);
                    if (!normalizedItemId) return [];
                    return renderCommands
                        .filter((command) => command && command.itemId === normalizedItemId && isRenderCommandUnresolved(command))
                        .map(cloneRenderCommand);
                }

                function normalizeRenderCommandStatus(status) {
                    const value = String(status || '').toLowerCase();
                    // Legacy input aliases: "accepted", "rendered", and "drawn" all
                    // mean the adapter committed pixels for this command. Remove after
                    // historical callback/status payloads are migrated to "committed".
                    if (value === 'accepted' || value === 'committed' || value === 'rendered' || value === 'drawn') return 'committed';
                    if (value === 'deferred') return 'deferred';
                    if (value === 'ready' || value === 'retry-ready' || value === 'queued') return 'ready';
                    if (value === 'noop' || value === 'no-op') return 'noop';
                    if (value === 'aborted' || value.indexOf('aborted-') === 0) return 'aborted';
                    if (value === 'superseded' || value.indexOf('superseded-') === 0) return 'superseded';
                    return 'rejected';
                }

                function normalizeRenderCommandDecision(status, decision, item, command = null) {
                    const details = decision && typeof decision.details === 'object' ? decision.details : {};
                    const normalizedDetails = pickSerializableObject(details);
                    const resumeWhen = normalizeRenderResumeWhen(decision.resumeWhen || normalizedDetails.resumeWhen);
                    const renderCommit = createRenderCommandDecisionCommit(status, decision, item, command, normalizedDetails);
                    const normalized = {
                        status,
                        reason: firstString(decision.reason, status),
                        commandId: firstString(decision.commandId, decision.id, command && command.commandId, command && command.id),
                        strategy: firstString(decision.strategy, command && command.strategy, item.renderStrategy),
                        commandGeneration: finiteNumber(decision.commandGeneration) || (command && command.generation) || 0,
                        queuedAt: command && command.queuedAt ? command.queuedAt : 0,
                        targetSurfaceId: firstString(decision.targetSurfaceId, command && command.targetSurfaceId),
                        adapterId: item.sourceAdapter || item.hook || '',
                        details: normalizedDetails,
                        terminal: isTerminalRenderCommandStatus(status),
                    };
                    if (resumeWhen) normalized.resumeWhen = resumeWhen;
                    if (renderCommit) normalized.renderCommit = renderCommit;
                    return normalized;
                }

                function createRenderCommandDecisionCommit(status, decision, item, command, details = {}) {
                    if (!renderTransaction || typeof renderTransaction.createRenderCommit !== 'function') return null;
                    const source = decision && typeof decision === 'object' ? decision : {};
                    const existingCommit = source.renderCommit && typeof source.renderCommit === 'object'
                        ? cloneRenderCommitInput(source.renderCommit)
                        : (isRenderCommitObject(source) ? cloneRenderCommitInput(source) : null);
                    const existingDetails = existingCommit && existingCommit.details && typeof existingCommit.details === 'object'
                        ? existingCommit.details
                        : {};
                    const mergedDetails = Object.assign({}, existingDetails, details || {});
                    return renderTransaction.createRenderCommit(Object.assign({}, existingCommit || {}, {
                        status,
                        phase: resolveRenderCommandCommitPhase(status),
                        reason: firstString(source.reason, status),
                        route: firstString(existingCommit && existingCommit.route, source.route, 'text-orchestrator'),
                        adapterId: firstString(existingCommit && existingCommit.adapterId, item && (item.sourceAdapter || item.hook)),
                        itemId: item && item.id ? item.id : firstString(source.itemId, source.recordId, existingCommit && existingCommit.itemId),
                        recordId: item && item.id ? item.id : firstString(source.recordId, source.itemId, existingCommit && existingCommit.recordId),
                        surfaceId: firstString(source.surfaceId, item && item.surfaceId, existingCommit && existingCommit.surfaceId),
                        slotKey: firstString(source.slotKey, item && item.slotKey, existingCommit && existingCommit.slotKey),
                        strategy: firstString(source.strategy, command && command.strategy, item && item.renderStrategy, existingCommit && existingCommit.strategy),
                        commandId: firstString(source.commandId, source.id, command && command.commandId, command && command.id, existingCommit && existingCommit.commandId),
                        commandGeneration: finiteNumber(source.commandGeneration) || (command && command.generation) || finiteNumber(existingCommit && existingCommit.commandGeneration),
                        generation: finiteNumber(source.generation) || (command && command.generation) || finiteNumber(existingCommit && existingCommit.generation) || (item && item.generation) || 0,
                        translationReceived: firstString(
                            source.translationReceived,
                            details && details.translationReceived,
                            command && command.text,
                            existingCommit && existingCommit.translationReceived,
                            item && item.translationReceived,
                            item && item.translation
                        ),
                        translationDrawn: firstString(
                            source.translationDrawn,
                            details && details.translationDrawn,
                            existingCommit && existingCommit.translationDrawn,
                            item && item.translationDrawn
                        ),
                        drawBoundary: source.drawBoundary
                            || details && details.drawBoundary
                            || existingCommit && existingCommit.drawBoundary
                            || item && item.drawBoundary
                            || null,
                        details: mergedDetails,
                    }));
                }

                function isRenderCommitObject(value) {
                    if (!value || typeof value !== 'object') return false;
                    if (finiteNumber(value.schemaVersion) !== 1) return false;
                    return value.committed === true
                        || value.deferred === true
                        || value.rejected === true
                        || value.noop === true
                        || firstString(value.phase).indexOf('render-') === 0;
                }

                function cloneRenderCommitInput(value) {
                    if (!value || typeof value !== 'object') return null;
                    const cloned = Object.assign({}, value);
                    const nestedSurfaceProof = cloned.surfaceProof && typeof cloned.surfaceProof === 'object'
                        ? cloned.surfaceProof
                        : (cloned.evidence && typeof cloned.evidence.surfaceProof === 'object'
                            ? cloned.evidence.surfaceProof
                            : (cloned.details && typeof cloned.details.surfaceProof === 'object'
                                ? cloned.details.surfaceProof
                                : null));
                    if (nestedSurfaceProof) cloned.surfaceProof = nestedSurfaceProof;
                    cloned.details = pickSerializableObject(cloned.details || {});
                    if (cloned.evidence && typeof cloned.evidence === 'object') {
                        cloned.evidence = pickSerializableObject(cloned.evidence);
                    }
                    return cloned;
                }

                function resolveRenderCommandCommitPhase(status) {
                    const phases = renderTransaction && renderTransaction.PHASES || {};
                    // Legacy payload alias: remove after historical renderCommit.status
                    // values have all been migrated from "accepted" to "committed".
                    if (status === 'committed' || status === 'accepted') return phases.RENDER_COMMITTED || 'render-committed';
                    if (status === 'deferred') return phases.RENDER_DEFERRED || 'render-deferred';
                    if (status === 'noop') return phases.RENDER_NOOP || 'render-noop';
                    return phases.RENDER_REJECTED || 'render-rejected';
                }

                function cloneRenderCommandDecision(value) {
                    return typeof cloneEventDetails === 'function'
                        ? cloneEventDetails(value || {})
                        : pickSerializableObject(value || {});
                }

                function updateRenderCommandStatus(command, status, decision) {
                    if (!command) return false;
                    const now = Date.now();
                    command.status = status;
                    command.decision = cloneRenderCommandDecision(decision || {});
                    command.lastOutcome = command.decision;
                    command.terminal = isTerminalRenderCommandStatus(status);
                    command.updatedAt = now;
                    if (status === 'committed') {
                        command.committedAt = now;
                    } else if (status === 'deferred') {
                        command.deferredAt = now;
                        command.resumeWhen = normalizeRenderResumeWhen(decision && (decision.resumeWhen || decision.details && decision.details.resumeWhen));
                    } else if (status === 'ready') {
                        command.readyAt = now;
                        command.terminal = false;
                    } else {
                        command.rejectedAt = now;
                    }
                    return true;
                }

                function publishReadyRenderCommand(item, command) {
                    if (!item || !command) return null;
                    command.dispatchCount = (finiteNumber(command.dispatchCount) || 0) + 1;
                    command.dispatchedAt = Date.now();
                    command.updatedAt = command.dispatchedAt;
                    // Legacy event name: adapters currently subscribe to item.render_queued.
                    // Replace with an explicit render-command-ready dispatch event once
                    // every adapter is migrated to the new command boundary.
                    return recordEvent('item.render_queued', item, {
                        message: command.strategy || '',
                        details: cloneRenderCommand(command),
                    });
                }

                function normalizeQueuedRenderCommandStatus(status) {
                    const normalized = normalizeRenderCommandStatus(status);
                    return normalized === 'deferred' ? 'deferred' : 'ready';
                }

                function getRenderCommandDecisionEventType(status) {
                    if (status === 'committed') return 'item.render_committed';
                    return `item.render_${status}`;
                }

                function normalizeRenderResumeWhen(value) {
                    if (!value || typeof value !== 'object') return null;
                    const normalized = pickSerializableObject(value);
                    return normalized && Object.keys(normalized).length ? normalized : null;
                }

                function normalizeRenderRecoveryProof(value) {
                    if (!value || typeof value !== 'object') return null;
                    const normalized = pickSerializableObject(value);
                    return normalized && Object.keys(normalized).length ? normalized : null;
                }

                function isRenderCommandUnresolved(command) {
                    if (!command || command.terminal === true) return false;
                    const status = String(command.status || '').toLowerCase();
                    return status === 'ready'
                        || status === 'retry-ready'
                        || status === 'queued'
                        || status === 'deferred';
                }

                function isRenderCommandDeferred(command) {
                    return !!command && String(command.status || '').toLowerCase() === 'deferred';
                }

                function isTerminalRenderCommandStatus(status) {
                    const value = String(status || '').toLowerCase();
                    // Legacy payload alias: remove after old snapshots stop feeding
                    // accepted render statuses back into recovery.
                    return value === 'committed'
                        || value === 'accepted'
                        || value === 'rejected'
                        || value === 'aborted'
                        || value === 'superseded'
                        || value === 'noop';
                }

                function createRenderCommandReadinessResult(status, item, command, reason, changed, terminal, fallbackCommandId = '') {
                    const commandId = command ? firstString(command.commandId, command.id) : firstString(fallbackCommandId);
                    const itemId = item && item.id ? item.id : (command && command.itemId ? command.itemId : '');
                    return Object.freeze({
                        status,
                        handled: changed === true || status === 'terminal-command',
                        changed: changed === true,
                        terminal: terminal === true,
                        itemId,
                        recordId: itemId,
                        commandId,
                        reason: firstString(reason, status),
                        command: command ? cloneRenderCommand(command) : null,
                    });
                }

                function cloneRenderCommand(command) {
                    return command ? pickSerializableObject(command) : null;
                }

                return {
                    queueRenderCommand,
                    queueStoredRenderCommand,
                    recordRenderCommitted,
                    recordRenderDeferred,
                    recordRenderRejected,
                    recordRenderCommandDecision,
                    notifyRenderCommandReady,
                    rejectOpenRenderCommands,
                    findRenderCommand,
                    getUnresolvedRenderCommandsForItem,
                    normalizeRenderCommandStatus,
                    normalizeRenderCommandDecision,
                    updateRenderCommandStatus,
                };
            }

            return { create: createController };
        },
    });
})();
