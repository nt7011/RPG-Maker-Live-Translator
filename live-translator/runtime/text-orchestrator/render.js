// Text orchestrator support: render.
// This controller keeps a cohesive slice of orchestrator behavior behind the shared instance scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/render.js.');
    }

    function createController(scope = {}) {
        const { firstString, firstNonEmptyString, finiteNumber, normalizeBounds, pickSerializableObject, normalizeId, renderCommandLimit, activeItems, renderCommands, renderTransaction } = scope;
        const { markTranslationNoop } = scope.controllerFacades.translationState;
        const { markItemRenderCycleAdmitted, markItemRenderCycleDecision, getItemById } = scope.controllerFacades.items;
        const { recordEvent } = scope.controllerFacades.events;
        const { isTranslationNoopRenderRejection } = scope.controllerFacades.sourceCache;

        /**
         * Queue a render instruction for the adapter that owns an item.
         *
         * The command is immutable data: item id, surface id, strategy, text,
         * generation, bounds, and metadata. Subscribers receive an
         * item.render_queued event and decide whether they can still apply it.
         * The queue event is not a draw-success event; adapters must report
         * item.rendered only after their engine-specific surface accepts text.
         */
        function queueRenderCommand(itemId, command = {}) {
            const item = activeItems.get(String(itemId || '')) || null;
            if (!item) return null;
            const text = firstString(command.text, item.translation, item.translationDrawn);
            const renderCommand = {
                id: command.id ? String(command.id) : `render:${++scope.renderSequence}`,
                itemId: item.id,
                surfaceId: item.surfaceId || '',
                strategy: firstString(command.strategy, item.renderStrategy),
                text,
                generation: finiteNumber(command.generation) || item.generation || 0,
                bounds: normalizeBounds(command.bounds) || (item.bounds ? Object.assign({}, item.bounds) : null),
                metadata: pickSerializableObject(command.metadata || {}),
                status: 'queued',
                queuedAt: Date.now(),
            };
            renderCommands.push(renderCommand);
            while (renderCommands.length > renderCommandLimit) renderCommands.shift();
            markItemRenderCycleAdmitted(item, renderCommand);
            recordEvent('item.render_queued', item, {
                message: renderCommand.strategy || '',
                details: renderCommand,
            });
            return Object.assign({}, renderCommand);
        }

        function recordRenderAccepted(id, decision = {}) {
            return recordRenderCommandDecision('accepted', id, decision);
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
            const command = findRenderCommand(item.id, source.commandId);
            const details = normalizeRenderCommandDecision(normalizedStatus, source, item, command);
            updateRenderCommandStatus(command, normalizedStatus, details);
            markItemRenderCycleDecision(item, normalizedStatus, details, command);
            const event = recordEvent(`item.render_${normalizedStatus}`, item, {
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

        function rejectOpenRenderCommands(item, reason, details = null) {
            if (!item || !item.id) return 0;
            let rejected = 0;
            for (let index = renderCommands.length - 1; index >= 0; index -= 1) {
                const command = renderCommands[index];
                if (!command || command.itemId !== item.id) continue;
                if (command.status !== 'queued' && command.status !== 'deferred') continue;
                const decision = normalizeRenderCommandDecision('rejected', {
                    commandId: command.id,
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
                if (normalizedCommandId && command.id === normalizedCommandId) return command;
                if (!normalizedCommandId && normalizedItemId && command.itemId === normalizedItemId) return command;
            }
            return null;
        }

        function normalizeRenderCommandStatus(status) {
            const value = String(status || '').toLowerCase();
            if (value === 'accepted') return 'accepted';
            if (value === 'deferred') return 'deferred';
            return 'rejected';
        }

        function normalizeRenderCommandDecision(status, decision, item, command = null) {
            const details = decision && typeof decision.details === 'object' ? decision.details : {};
            const normalizedDetails = pickSerializableObject(details);
            const renderCommit = createRenderCommandDecisionCommit(status, decision, item, command, normalizedDetails);
            const normalized = {
                status,
                reason: firstString(decision.reason, status),
                commandId: firstString(decision.commandId, command && command.id),
                strategy: firstString(decision.strategy, command && command.strategy, item.renderStrategy),
                commandGeneration: finiteNumber(decision.commandGeneration) || (command && command.generation) || 0,
                queuedAt: command && command.queuedAt ? command.queuedAt : 0,
                adapterId: item.sourceAdapter || item.hook || '',
                details: normalizedDetails,
            };
            if (renderCommit) normalized.renderCommit = renderCommit;
            return normalized;
        }

        function createRenderCommandDecisionCommit(status, decision, item, command, details = {}) {
            if (!renderTransaction || typeof renderTransaction.createRenderCommit !== 'function') return null;
            const source = decision && typeof decision === 'object' ? decision : {};
            const existingCommit = source.renderCommit && typeof source.renderCommit === 'object'
                ? pickSerializableObject(source.renderCommit)
                : null;
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
                commandId: firstString(source.commandId, command && command.id, existingCommit && existingCommit.commandId),
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

        function resolveRenderCommandCommitPhase(status) {
            const phases = renderTransaction && renderTransaction.PHASES || {};
            if (status === 'accepted') return phases.RENDER_COMMITTED || 'render-committed';
            if (status === 'deferred') return phases.RENDER_DEFERRED || 'render-deferred';
            if (status === 'noop') return phases.RENDER_NOOP || 'render-noop';
            return phases.RENDER_REJECTED || 'render-rejected';
        }

        function updateRenderCommandStatus(command, status, decision) {
            if (!command) return false;
            command.status = status;
            command.decision = pickSerializableObject(decision || {});
            if (status === 'accepted') {
                command.acceptedAt = Date.now();
            } else if (status === 'deferred') {
                command.deferredAt = Date.now();
            } else {
                command.rejectedAt = Date.now();
            }
            return true;
        }

        return {
            queueRenderCommand,
            recordRenderAccepted,
            recordRenderDeferred,
            recordRenderRejected,
            recordRenderCommandDecision,
            rejectOpenRenderCommands,
            findRenderCommand,
            normalizeRenderCommandStatus,
            normalizeRenderCommandDecision,
            updateRenderCommandStatus,
        };
    }

    defineRuntimeModule('runtime.textOrchestratorRender', { create: createController });
})();
