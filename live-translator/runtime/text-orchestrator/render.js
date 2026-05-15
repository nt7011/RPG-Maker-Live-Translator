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
        const { firstString, firstNonEmptyString, finiteNumber, normalizeBounds, pickSerializableObject, normalizeId, renderCommandLimit, activeItems, renderCommands } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { markTranslationNoop, getItemById, recordEvent, isTranslationNoopRenderRejection } = Object.fromEntries(['markTranslationNoop', 'getItemById', 'recordEvent', 'isTranslationNoopRenderRejection'].map((name) => [name, callScope(name)]));

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
            return {
                status,
                reason: firstString(decision.reason, status),
                commandId: firstString(decision.commandId, command && command.id),
                strategy: firstString(decision.strategy, command && command.strategy, item.renderStrategy),
                commandGeneration: finiteNumber(decision.commandGeneration) || (command && command.generation) || 0,
                queuedAt: command && command.queuedAt ? command.queuedAt : 0,
                adapterId: item.sourceAdapter || item.hook || '',
                details: pickSerializableObject(details),
            };
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
