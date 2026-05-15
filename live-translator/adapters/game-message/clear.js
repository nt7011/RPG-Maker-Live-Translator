// Game message adapter support: clear.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/clear.js.');
    }

    function createController(scope = {}) {
        const { MESSAGE_ACTIVE_PRIORITY, MESSAGE_BACKGROUND_PRIORITY, logger, diag, preview, detachedRecords } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { resetWindowMessageState, collectWindowsForGameMessage, clearMessageOrigin, getWindowType, backgroundItem, setRecordPriority, setRecordVisibility, retireItem, resolveMessageRecord, forgetRenderTarget, resetStreamState, getMessageScreenState } = Object.fromEntries(['resetWindowMessageState', 'collectWindowsForGameMessage', 'clearMessageOrigin', 'getWindowType', 'backgroundItem', 'setRecordPriority', 'setRecordVisibility', 'retireItem', 'resolveMessageRecord', 'forgetRenderTarget', 'resetStreamState', 'getMessageScreenState'].map((name) => [name, callScope(name)]));

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

        function hasHookInChain(fn, property, token) {
            const seen = [];
            let current = typeof fn === 'function' ? fn : null;
            while (current && seen.indexOf(current) < 0) {
                if (current[property] === token) return true;
                seen.push(current);
                current = typeof current.__trOriginal === 'function' ? current.__trOriginal : null;
            }
            return false;
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
         * Clear message record fields stored on a Window_Message object.
         */
        function clearRecordFields(windowInstance) {
            if (!windowInstance) return;
            windowInstance._trMessageRequestToken = null;
            windowInstance._trMessageTranslationSessionId = null;
            windowInstance._trMessageTranslationRecordId = null;
            windowInstance._trMessageTranslationPriority = null;
            windowInstance._trMessageRecordId = null;
            windowInstance._trMessageRecord = null;
            windowInstance._trMessagePayload = null;
            windowInstance._trMessageRecordSessionId = null;
            windowInstance._trMessageSeenVisible = false;
            windowInstance._trMessageOnScreen = false;
            windowInstance._trMessageScreenState = null;
            windowInstance._trMessageRenderRetained = false;
            windowInstance._trMessageRenderRetainedReason = '';
        }

        /**
         * Detach the current message record and background or retire it by request state.
         */
        function detachCurrentMessageRecord(windowInstance, reason = 'message-detached', details = null) {
            if (!windowInstance || !windowInstance._trMessageRecordId) {
                resetStreamState(windowInstance);
                return false;
            }

            const hasActiveRequest = !!windowInstance._trMessageRequestToken;
            const recordId = windowInstance._trMessageRecordId ? String(windowInstance._trMessageRecordId) : '';
            const record = resolveMessageRecord(windowInstance._trMessageRecord || recordId);
            const baseDetails = Object.assign({
                windowType: getWindowType(windowInstance),
                screenState: getMessageScreenState(windowInstance),
                seenVisible: !!windowInstance._trMessageSeenVisible,
                detachedCacheable: true,
            }, details || {});

            if (hasActiveRequest && shouldRetainMessageRenderTarget(windowInstance, reason, baseDetails)) {
                windowInstance._trMessageRenderRetained = true;
                windowInstance._trMessageRenderRetainedReason = reason || 'message-detached';
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
            if (!windowInstance || !windowInstance._trMessageRequestToken) return false;
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
            if (!windowInstance || !windowInstance._trMessageRecordId) return;
            const recordId = windowInstance._trMessageRecordId;
            const record = resolveMessageRecord(windowInstance._trMessageRecord || recordId);
            const nextScreenState = options.opening ? 'opening' : (screenState || getMessageScreenState(windowInstance));
            const onScreen = nextScreenState === 'visible';
            if (windowInstance._trMessageScreenState === nextScreenState
                && windowInstance._trMessageOnScreen === onScreen) {
                return;
            }

            windowInstance._trMessageScreenState = nextScreenState;
            windowInstance._trMessageOnScreen = onScreen;
            if (onScreen) windowInstance._trMessageSeenVisible = true;

            setRecordVisibility(record, onScreen, {
                reason: onScreen ? 'message-visible' : `message-${nextScreenState || 'offscreen'}`,
                screenState: nextScreenState,
                windowType: getWindowType(windowInstance),
                opening: !!options.opening,
            });
            setRecordPriority(
                record,
                onScreen ? MESSAGE_ACTIVE_PRIORITY : MESSAGE_BACKGROUND_PRIORITY,
                onScreen ? 'message-visible' : `message-${nextScreenState || 'offscreen'}`
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

    defineRuntimeModule('adapters.gameMessage.clear', { create: createController });
})();
