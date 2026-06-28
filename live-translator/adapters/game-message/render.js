// Game message adapter support: render.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.gameMessage.render',
        requires: {
            displayStateModule: 'runtime.displayState',
        },
        factory({ displayStateModule }, { scope: globalScope }) {

    function createController(scope = {}) {
        const { logger, dbg, preview, stripControls, adapterContract, detachedRecords } = scope;
        const displayState = displayStateModule.createDisplayStateService(scope.globalScope || globalScope);
        const { prepareMessageRedrawText } = scope.controllerFacades.evaluation;
        const { restoreMessageText } = scope.controllerFacades.text;
        const { redrawMessageText, createPendingRenderDecision } = scope.controllerFacades.redraw;
        const { getWindowType, updateItem, retireItem, resolveMessageRecord } = scope.controllerFacades.records;
        const { isSessionCurrent, isCurrentTranslation, getMessageRenderSession, getPendingMessageRedrawSession, clearMessageRequestSession, getMessageStreamPreviewText, isMessageStreamPreviewCurrent, stopMessageStreamPreview, clearPendingStreamPreviewSession } = scope.controllerFacades.session;

        /**
         * Apply a completed translation render command committed by the contract gate.
         */
        function applyRenderCommand(target, command = {}, route = {}) {
            const windowInstance = target.windowInstance;
            const payload = target.payload;
            const sessionId = target.sessionId;
            const record = target.record || resolveMessageRecord(route.recordId);
            const translated = typeof command.text === 'string' ? command.text : '';
            let restored = restoreMessageText(translated, payload);
            if (typeof restored !== 'string' || !restored.trim()) restored = payload.resolved;
            const prepared = prepareMessageRedrawText(windowInstance, restored, payload, {
                streamingPreview: false,
            });

            const restoredVisible = stripControls((prepared && prepared.text) || restored || '').trim();
            const renderDetails = {
                source: 'message',
                sessionId,
                windowType: target.windowType || getWindowType(windowInstance),
                translationReceived: command.metadata && command.metadata.translationReceived
                    ? command.metadata.translationReceived
                    : translated,
            };

            if (!prepared || !prepared.ok || !restoredVisible) {
                skipRender(record, windowInstance, payload, sessionId, prepared && prepared.reason ? prepared.reason : 'restored text empty', renderDetails);
                return true;
            }
            const matchedOriginal = restoredVisible === payload.visible;
            const appliedDetails = Object.assign({}, renderDetails, {
                translationDrawn: prepared.text,
                translationRestored: restored,
                matchedOriginal,
            });
            const pendingRenderDecision = createPendingRenderDecision(command, route, appliedDetails);

            const requestToken = getMessageRenderSession(windowInstance).requestToken;
            stopStreamPreview(windowInstance, sessionId, requestToken, true);
            dbg(`[GameMessage] Translation: "${preview(payload.visible)}" -> "${preview(restoredVisible)}"`);
            const drawn = redrawMessageText(windowInstance, prepared.text, sessionId, {
                preconverted: prepared.preconverted === true,
                renderEvent: {
                    text: prepared.text,
                    details: appliedDetails,
                },
                renderDecision: pendingRenderDecision,
            });
            // Render commands are instructions, not proof that the native
            // window committed pixels. Report item.rendered only after an
            // immediate draw succeeds; deferred draws report it from
            // applyPendingMessageRedraw.
            if (drawn) {
                markMessageRendered(record, prepared.text, appliedDetails);
                clearCurrentRequestToken(windowInstance);
                return true;
            } else if (!getPendingMessageRedrawSession(windowInstance)) {
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
            const renderSession = getMessageRenderSession(windowInstance);
            const recordMatches = renderSession.recordId === recordId
                && renderSession.recordSessionId === target.sessionId;
            if (!recordMatches) return false;
            if (renderSession.renderRetained === true) {
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
            const requestToken = getMessageRenderSession(windowInstance).requestToken;
            stopStreamPreview(windowInstance, sessionId, requestToken, true);
            restoreOriginalAfterStreamPreview(windowInstance, payload, sessionId, requestToken);
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
            if (!isMessageStreamPreviewCurrent(windowInstance, sessionId)) return;
            clearPendingStreamPreview(windowInstance, sessionId);
            stopMessageStreamPreview(windowInstance, sessionId, {
                preserveText: preserveText === true,
            });
        }

        /**
         * Drop a queued streaming preview redraw without touching final render work.
         */
        function clearPendingStreamPreview(windowInstance, sessionId = null) {
            return clearPendingStreamPreviewSession(windowInstance, sessionId).changed === true;
        }

        /**
         * Restore source text after a stream preview when final output is skipped/failed.
         */
        function restoreOriginalAfterStreamPreview(windowInstance, payload, sessionId, requestToken = null) {
            if (!windowInstance || !payload) return;
            if (requestToken && !isCurrentTranslation(windowInstance, sessionId, requestToken)) return;
            if (!getMessageStreamPreviewText(windowInstance)) return;
            redrawMessageText(windowInstance, payload.resolved, sessionId);
        }

        /**
         * Clear the current request token from a window if it still matches.
         */
        function clearCurrentRequestToken(windowInstance, requestToken = null) {
            clearMessageRequestSession(windowInstance, requestToken);
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
            const renderSession = target && target.windowInstance ? getMessageRenderSession(target.windowInstance) : null;
            if (!target || !target.windowInstance || !renderSession || renderSession.recordId !== recordId) {
                retireDetachedRecord(recordId, 'message-detached-failed', event.details || null);
                return;
            }
            if (!renderSession.requestToken) return;
            stopStreamPreview(target.windowInstance, target.sessionId, renderSession.requestToken, true);
            restoreOriginalAfterStreamPreview(target.windowInstance, target.payload, target.sessionId, renderSession.requestToken);
            clearCurrentRequestToken(target.windowInstance);
            markRenderFailed(target.record || recordId, event.message || 'translation failed', event.details || null);
            errorLog('[GameMessage] Translation failed', event.message || 'translation failed');
        }

        /**
         * Handle an orchestrator-owned skip for an attached or detached message.
         */
        function handleRequestSkipped(target, event = {}, recordId = '') {
            const renderSession = target && target.windowInstance ? getMessageRenderSession(target.windowInstance) : null;
            if (target && target.windowInstance && renderSession && renderSession.recordId === recordId) {
                if (!renderSession.requestToken) return;
                stopStreamPreview(target.windowInstance, target.sessionId, renderSession.requestToken, true);
                restoreOriginalAfterStreamPreview(target.windowInstance, target.payload, target.sessionId, renderSession.requestToken);
                clearCurrentRequestToken(target.windowInstance);
            } else {
                retireDetachedRecord(recordId, 'message-detached-skipped', event.details || null);
            }
        }

        /**
         * Return a broad message-window visibility state.
         */
        function getMessageScreenState(windowInstance) {
            if (!windowInstance) return 'removed';
            const chainState = displayState.describeDisplayChain(windowInstance);
            if (chainState.state === 'inactive-scene') return 'inactive-scene';
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
            getMessageScreenState,
            warn,
            isAdapterContractFailure,
            errorLog,
        };
    }

            return { create: createController };
        },
    });
})();
