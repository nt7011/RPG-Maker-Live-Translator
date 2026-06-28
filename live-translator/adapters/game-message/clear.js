// Game message adapter support: clear.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.gameMessage.clear',
        requires: {
            hookWrapper: 'runtime.hookWrapper',
        },
        factory({ hookWrapper }) {
            const { hasHookInChain } = hookWrapper;

    function createController(scope = {}) {
        const { MESSAGE_ACTIVE_PRIORITY, MESSAGE_BACKGROUND_PRIORITY, logger, diag, preview, detachedRecords } = scope;
        const { clearMessageOrigin } = scope.controllerFacades.foresightContext;
        const { getWindowType, backgroundItem, setRecordPriority, setRecordVisibility, retireItem, resolveMessageRecord, forgetRenderTarget } = scope.controllerFacades.records;
        const { getMessageScreenState } = scope.controllerFacades.render;
        const { resetWindowMessageState, collectWindowsForGameMessage, resetStreamState, getMessageRenderSession, clearMessageRenderSession, setMessageRenderRetained, updateMessageVisibilitySession } = scope.controllerFacades.session;

        /**
         * Install Game_Message.clear so active messages become detached/background.
         */
        function installGameMessageClearHook() {
            if (typeof Game_Message === 'undefined'
                || !Game_Message
                || !Game_Message.prototype
                || typeof Game_Message.prototype.clear !== 'function'
                || hasHookInChain(Game_Message.prototype.clear, '__trGameMessageClearWrapped', true)) {
                return;
            }
            const original = Game_Message.prototype.clear;
            // Clear native message state first, then detach matching message windows.
            Game_Message.prototype.clear = function(...args) {
                const result = original.apply(this, args);
                clearMessageOrigin(this);
                clearForesightSnapshot();
                const windows = collectWindowsForGameMessage(this);
                let diagnosticState = null;
                windows.forEach((windowInstance) => {
                    diagnosticState = resetWindowMessageState(windowInstance) || diagnosticState;
                });
                if (!diagnosticState) {
                    scope.fallbackMessageState.currentText = '';
                    scope.fallbackMessageState.isActive = false;
                    scope.fallbackMessageState.lastUpdate = Date.now();
                    scope.fallbackMessageState.session += 1;
                    diagnosticState = scope.fallbackMessageState;
                }
                diag('Game_Message.clear() - Message cleared');
                showDiagnostics(diagnosticState);
                return result;
            };
            Game_Message.prototype.clear.__trOriginal = original;
            Game_Message.prototype.clear.__trGameMessageClearWrapped = true;
        }

        function clearForesightSnapshot() {
            if (!scope.foresightEnabled) return;
            if (scope.foresightScanner && typeof scope.foresightScanner.clearSnapshot === 'function') {
                scope.foresightScanner.clearSnapshot();
            }
        }

        /**
         * Print low-level message adapter state when trace logging is enabled.
         */
        function showDiagnostics(state = scope.fallbackMessageState) {
            try {
                if (!logger || typeof logger.shouldLog !== 'function' || !logger.shouldLog('trace')) return;
                const status = state.isActive ? 'active' : 'cleared';
                const timestamp = new Date(state.lastUpdate).toLocaleTimeString();
                const textPreview = state.currentText ? preview(state.currentText) : '(empty)';
                logger.trace(`[GameMessage] state=${status} updated=${timestamp} text="${textPreview}"`);
            } catch (_) {}
        }

        /**
         * Clear render-session state for the current Window_Message object.
         */
        function clearRecordFields(windowInstance) {
            if (!windowInstance) return null;
            return clearMessageRenderSession(windowInstance);
        }

        /**
         * Detach the current message record and background or retire it by request state.
         */
        function detachCurrentMessageRecord(windowInstance, reason = 'message-detached', details = null) {
            const renderSession = windowInstance ? getMessageRenderSession(windowInstance) : null;
            if (!renderSession || !renderSession.recordId) {
                resetStreamState(windowInstance);
                return false;
            }

            const hasActiveRequest = !!renderSession.requestToken;
            const recordId = String(renderSession.recordId || '');
            const record = resolveMessageRecord(renderSession.record || recordId);
            const baseDetails = Object.assign({
                windowType: getWindowType(windowInstance),
                screenState: getMessageScreenState(windowInstance),
                seenVisible: !!renderSession.seenVisible,
                detachedCacheable: true,
            }, details || {});

            if (hasActiveRequest && shouldRetainMessageRenderTarget(windowInstance, reason, baseDetails)) {
                setMessageRenderRetained(windowInstance, true, reason || 'message-detached');
                backgroundItem(record, reason, Object.assign({}, baseDetails, {
                    renderTargetRetained: true,
                }));
                return true;
            }

            const detachedRecordId = forgetRenderTarget(windowInstance, reason, details || {});
            const detachedRecord = record || resolveMessageRecord(detachedRecordId);
            if (hasActiveRequest) {
                backgroundItem(detachedRecord, reason, baseDetails);
            } else {
                retireItem(detachedRecord, 'disappeared', reason, baseDetails);
                detachedRecords.delete(detachedRecordId);
            }
            clearRecordFields(windowInstance);
            resetStreamState(windowInstance);
            return true;
        }

        function shouldRetainMessageRenderTarget(windowInstance, reason = '', details = {}) {
            const renderSession = windowInstance ? getMessageRenderSession(windowInstance) : null;
            if (!renderSession || !renderSession.requestToken) return false;
            if (details && details.forceDetach === true) return false;
            if (isStructuralDetachReason(reason)) return false;
            return getMessageScreenState(windowInstance) === 'visible';
        }

        function isStructuralDetachReason(reason = '') {
            const value = String(reason || '');
            return value === 'message-session-replaced'
                || value === 'message-translation-replaced'
                || value === 'message-window-destroy'
                || value === 'message-window-hide';
        }

        /**
         * Record visibility and priority for a message that remains attached.
         */
        function updateRecordVisibility(windowInstance, screenState, options = {}) {
            const renderSession = windowInstance ? getMessageRenderSession(windowInstance) : null;
            if (!renderSession || !renderSession.recordId) return;
            const recordId = renderSession.recordId;
            const record = resolveMessageRecord(renderSession.record || recordId);
            const nextState = updateMessageVisibilitySession(
                windowInstance,
                screenState || getMessageScreenState(windowInstance),
                options
            );
            if (!nextState.changed) return;

            setRecordVisibility(record, nextState.onScreen, {
                reason: nextState.onScreen ? 'message-visible' : `message-${nextState.screenState || 'offscreen'}`,
                screenState: nextState.screenState,
                windowType: getWindowType(windowInstance),
                opening: !!options.opening,
            });
            setRecordPriority(
                record,
                nextState.onScreen ? MESSAGE_ACTIVE_PRIORITY : MESSAGE_BACKGROUND_PRIORITY,
                nextState.onScreen ? 'message-visible' : `message-${nextState.screenState || 'offscreen'}`
            );
        }

        return {
            installGameMessageClearHook,
            hasHookInChain,
            clearForesightSnapshot,
            showDiagnostics,
            clearRecordFields,
            detachCurrentMessageRecord,
            shouldRetainMessageRenderTarget,
            isStructuralDetachReason,
            updateRecordVisibility,
        };
    }

            return { create: createController };
        },
    });
})();
