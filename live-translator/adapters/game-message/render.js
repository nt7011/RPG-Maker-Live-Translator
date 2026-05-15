// Game message adapter support: render.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/render.js.');
    }

    function createController(scope = {}) {
        const { logger, dbg, preview, stripControls, adapterContract, detachedRecords } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { restoreMessageText, redrawMessageText, applyPendingMessageRedraw, createPendingRenderDecision, isSessionCurrent, isCurrentTranslation, getWindowType, updateItem, retireItem, resolveMessageRecord } = Object.fromEntries(['restoreMessageText', 'redrawMessageText', 'applyPendingMessageRedraw', 'createPendingRenderDecision', 'isSessionCurrent', 'isCurrentTranslation', 'getWindowType', 'updateItem', 'retireItem', 'resolveMessageRecord'].map((name) => [name, callScope(name)]));

        /**
         * Apply a completed translation render command accepted by the contract gate.
         */
        function applyRenderCommand(target, command = {}, route = {}) {
            const windowInstance = target.windowInstance;
            const payload = target.payload;
            const sessionId = target.sessionId;
            const record = target.record || resolveMessageRecord(route.recordId);
            const translated = typeof command.text === 'string' ? command.text : '';
            let restored = restoreMessageText(translated, payload);
            if (typeof restored !== 'string' || !restored.trim()) restored = payload.resolved;

            const restoredVisible = stripControls(restored || '').trim();
            const renderDetails = {
                source: 'message',
                sessionId,
                windowType: target.windowType || getWindowType(windowInstance),
                translationReceived: command.metadata && command.metadata.translationReceived
                    ? command.metadata.translationReceived
                    : translated,
            };

            if (!restoredVisible) {
                skipRender(record, windowInstance, payload, sessionId, 'restored text empty', renderDetails);
                return true;
            }
            const matchedOriginal = restoredVisible === payload.visible;
            const appliedDetails = Object.assign({}, renderDetails, {
                translationDrawn: restored,
                matchedOriginal,
            });
            const pendingRenderDecision = createPendingRenderDecision(command, route, appliedDetails);

            stopStreamPreview(windowInstance, sessionId, windowInstance._trMessageRequestToken, true);
            dbg(`[GameMessage] Translation: "${preview(payload.visible)}" -> "${preview(restoredVisible)}"`);
            const drawn = redrawMessageText(windowInstance, restored, sessionId, {
                renderEvent: {
                    text: restored,
                    details: appliedDetails,
                },
                renderDecision: pendingRenderDecision,
            });
            // Render commands are instructions, not proof that the native
            // window accepted pixels. Report item.rendered only after an
            // immediate draw succeeds; deferred draws report it from
            // applyPendingMessageRedraw.
            if (drawn) {
                markMessageRendered(record, restored, appliedDetails);
                clearCurrentRequestToken(windowInstance);
                return true;
            } else if (!windowInstance._trPendingRedraw) {
                markRenderFailed(record, 'message redraw failed', renderDetails);
                clearCurrentRequestToken(windowInstance);
                return false;
            }
            clearCurrentRequestToken(windowInstance);
            return {
                status: 'deferred',
                reason: pendingRenderDecision && pendingRenderDecision.reason || 'message-redraw-deferred',
                details: pendingRenderDecision && pendingRenderDecision.details || appliedDetails,
            };
        }

        function getLifecycleRecord(target) {
            return target && target.record ? target.record : null;
        }

        function getRenderGeneration(target) {
            return target && target.sessionId ? Number(target.sessionId) : 0;
        }

        /**
         * Decide whether an orchestrator render command still matches this window.
         */
        function isRenderTargetCurrent(target, command, route = {}) {
            const recordId = route && route.recordId ? route.recordId : '';
            if (!recordId || !target || !target.windowInstance) return false;
            const windowInstance = target.windowInstance;
            const recordMatches = windowInstance._trMessageRecordId === recordId
                && windowInstance._trMessageRecordSessionId === target.sessionId;
            if (!recordMatches) return false;
            if (windowInstance._trMessageRenderRetained === true) {
                const screenState = getMessageScreenState(windowInstance);
                return screenState === 'visible'
                    ? true
                    : {
                        reason: 'retained-message-not-visible',
                        screenState,
                    };
            }
            return isSessionCurrent(windowInstance, target.sessionId);
        }

        function handleRenderRejected(target, decision, route = {}) {
            const recordId = route && route.recordId ? route.recordId : '';
            if (!recordId) return;
            retireDetachedRecord(recordId, 'message-detached-completed', {
                commandId: decision && decision.commandId ? decision.commandId : '',
                reason: decision && decision.reason ? decision.reason : 'render-rejected',
            });
        }

        /**
         * Handle a render command that should not draw because the output is unusable.
         */
        function skipRender(record, windowInstance, payload, sessionId, reason, details) {
            stopStreamPreview(windowInstance, sessionId, windowInstance._trMessageRequestToken, true);
            restoreOriginalAfterStreamPreview(windowInstance, payload, sessionId, windowInstance._trMessageRequestToken);
            clearCurrentRequestToken(windowInstance);
            markRenderSkipped(record, reason, details);
            dbg(`[GameMessage Skip] ${reason}.`);
        }

        /**
         * Stop the pending streaming preview loop for one active message.
         */
        function stopStreamPreview(windowInstance, sessionId, requestToken = null, preserveText = true) {
            if (!windowInstance) return;
            if (requestToken && !isCurrentTranslation(windowInstance, sessionId, requestToken)) return;
            if (windowInstance._trStreamSessionId !== sessionId) return;
            clearPendingStreamPreview(windowInstance, sessionId);
            windowInstance._trStreamLoopActive = false;
            windowInstance._trStreamSessionId = null;
            windowInstance._trStreamDeferredLogged = false;
            if (!preserveText) windowInstance._trStreamText = '';
        }

        /**
         * Drop a queued streaming preview redraw without touching final render work.
         */
        function clearPendingStreamPreview(windowInstance, sessionId = null) {
            const pending = windowInstance && windowInstance._trPendingRedraw;
            if (!pending || pending.streamingPreview !== true) return false;
            if (sessionId !== null && pending.sessionId && pending.sessionId !== sessionId) return false;
            windowInstance._trPendingRedraw = null;
            return true;
        }

        /**
         * Restore source text after a stream preview when final output is skipped/failed.
         */
        function restoreOriginalAfterStreamPreview(windowInstance, payload, sessionId, requestToken = null) {
            if (!windowInstance || !payload) return;
            if (requestToken && !isCurrentTranslation(windowInstance, sessionId, requestToken)) return;
            if (typeof windowInstance._trStreamText !== 'string' || !windowInstance._trStreamText) return;
            redrawMessageText(windowInstance, payload.resolved, sessionId);
        }

        /**
         * Clear the current request token from a window if it still matches.
         */
        function clearCurrentRequestToken(windowInstance, requestToken = null) {
            if (!windowInstance) return;
            if (requestToken && windowInstance._trMessageRequestToken !== requestToken) return;
            windowInstance._trMessageRequestToken = null;
            windowInstance._trMessageTranslationSessionId = null;
            windowInstance._trMessageTranslationRecordId = null;
            windowInstance._trMessageTranslationPriority = null;
        }

        /**
         * Mark a render command as skipped without claiming translation ownership.
         */
        function markRenderSkipped(record, reason, details = {}) {
            updateItem(record, { status: 'skipped' }, 'item.render_skipped', Object.assign({ reason }, details || {}));
        }

        /**
         * Mark a render/request failure for diagnostics.
         */
        function markRenderFailed(record, reason, details = {}) {
            updateItem(record, { status: 'failed' }, 'item.render_failed', Object.assign({ reason }, details || {}));
        }

        /**
         * Record that adapter drawing reached the message surface.
         */
        function markMessageRendered(record, text, details = {}, options = {}) {
            updateItem(record, {
                status: 'completed',
                translation: text,
                translationDrawn: text,
            }, 'item.rendered', Object.assign({}, details || {}, {
                translationDrawn: text,
                deferred: options.deferred === true,
            }));
        }

        /**
         * Retire a detached item after its background request completes.
         */
        function retireDetachedRecord(recordId, reason, details = {}) {
            if (!recordId || !detachedRecords.has(recordId)) return false;
            const detached = detachedRecords.get(recordId) || {};
            detachedRecords.delete(recordId);
            const detachedDetails = Object.assign({}, detached);
            delete detachedDetails.record;
            const mergedDetails = Object.assign({}, detachedDetails, details || {});
            retireItem(detached.record || recordId, 'disappeared', reason || 'message-detached-completed', mergedDetails);
            return true;
        }

        /**
         * Handle an orchestrator-owned request failure for an attached message.
         */
        function handleRequestFailed(target, event = {}, recordId = '') {
            if (!target || !target.windowInstance || target.windowInstance._trMessageRecordId !== recordId) {
                retireDetachedRecord(recordId, 'message-detached-failed', event.details || null);
                return;
            }
            if (!target.windowInstance._trMessageRequestToken) return;
            stopStreamPreview(target.windowInstance, target.sessionId, target.windowInstance._trMessageRequestToken, true);
            restoreOriginalAfterStreamPreview(target.windowInstance, target.payload, target.sessionId, target.windowInstance._trMessageRequestToken);
            clearCurrentRequestToken(target.windowInstance);
            markRenderFailed(target.record || recordId, event.message || 'translation failed', event.details || null);
            errorLog('[GameMessage] Translation failed', event.message || 'translation failed');
        }

        /**
         * Handle an orchestrator-owned skip for an attached or detached message.
         */
        function handleRequestSkipped(target, event = {}, recordId = '') {
            if (target && target.windowInstance && target.windowInstance._trMessageRecordId === recordId) {
                if (!target.windowInstance._trMessageRequestToken) return;
                stopStreamPreview(target.windowInstance, target.sessionId, target.windowInstance._trMessageRequestToken, true);
                restoreOriginalAfterStreamPreview(target.windowInstance, target.payload, target.sessionId, target.windowInstance._trMessageRequestToken);
                clearCurrentRequestToken(target.windowInstance);
            } else {
                retireDetachedRecord(recordId, 'message-detached-skipped', event.details || null);
            }
        }

        /**
         * Reset streaming preview fields on a Window_Message object.
         */
        function resetStreamState(windowInstance) {
            if (!windowInstance) return;
            clearPendingStreamPreview(windowInstance);
            windowInstance._trStreamAbort = null;
            windowInstance._trStreamText = '';
            windowInstance._trStreamSessionId = null;
            windowInstance._trStreamLoopActive = false;
            windowInstance._trStreamDeferredLogged = false;
        }

        /**
         * Return a broad message-window visibility state.
         */
        function getMessageScreenState(windowInstance) {
            if (!windowInstance) return 'removed';
            if (windowInstance.visible === false) return 'hidden';
            const openness = Number(windowInstance.openness);
            if (Number.isFinite(openness) && openness <= 0) return 'closed';
            const contentsOpacity = Number(windowInstance.contentsOpacity);
            if (Number.isFinite(contentsOpacity) && contentsOpacity <= 0) return 'transparent';
            return 'visible';
        }

        /**
         * Log a warning if the configured logger supports it.
         */
        function warn(message, error) {
            if (logger && typeof logger.warn === 'function') logger.warn(message, error);
        }

        function isAdapterContractFailure(error) {
            return !!(adapterContract
                && typeof adapterContract.isContractError === 'function'
                && adapterContract.isContractError(error));
        }

        /**
         * Log an error if the configured logger supports it.
         */
        function errorLog(message, error) {
            if (logger && typeof logger.error === 'function') logger.error(message, error);
        }

        return {
            applyRenderCommand,
            getLifecycleRecord,
            getRenderGeneration,
            isRenderTargetCurrent,
            handleRenderRejected,
            skipRender,
            stopStreamPreview,
            restoreOriginalAfterStreamPreview,
            clearCurrentRequestToken,
            markRenderSkipped,
            markRenderFailed,
            markMessageRendered,
            retireDetachedRecord,
            handleRequestFailed,
            handleRequestSkipped,
            resetStreamState,
            getMessageScreenState,
            warn,
            isAdapterContractFailure,
            errorLog,
        };
    }

    defineRuntimeModule('adapters.gameMessage.render', { create: createController });
})();
