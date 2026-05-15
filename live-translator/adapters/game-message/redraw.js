// Game message adapter support: redraw.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/redraw.js.');
    }

    function createController(scope = {}) {
        const { MESSAGE_RENDER_STRATEGY } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { markDedicatedMessageWindow, drawMessageFaceIfNeeded, resolveMessageStartCoordinates, createTextScaleScope, disposeTextScaleScope, ensureTextScaleScope, wrapMessageText, isSessionCurrent, getWindowType, recordDecision, recordRenderAccepted, recordRenderRejected, resolveMessageRecord, markMessageRendered, getMessageScreenState, warn } = Object.fromEntries(['markDedicatedMessageWindow', 'drawMessageFaceIfNeeded', 'resolveMessageStartCoordinates', 'createTextScaleScope', 'disposeTextScaleScope', 'ensureTextScaleScope', 'wrapMessageText', 'isSessionCurrent', 'getWindowType', 'recordDecision', 'recordRenderAccepted', 'recordRenderRejected', 'resolveMessageRecord', 'markMessageRendered', 'getMessageScreenState', 'warn'].map((name) => [name, callScope(name)]));

        /**
         * Check whether native processCharacter rendering is available for redraw.
         */
        function canUseNativeRender(windowInstance) {
            if (!windowInstance || !windowInstance.contents) return false;
            if (typeof windowInstance.newPage !== 'function'
                || typeof windowInstance.processCharacter !== 'function'
                || typeof windowInstance.isEndOfText !== 'function'
                || typeof windowInstance.onEndOfText !== 'function') {
                return false;
            }
            return !(typeof windowInstance.isAnySubWindowActive === 'function' && windowInstance.isAnySubWindowActive());
        }

        /**
         * Draw a deferred face bitmap if it is now ready.
         */
        function drawMessageFaceIfReady(windowInstance) {
            if (!windowInstance || !windowInstance._faceBitmap) return false;
            try {
                if (typeof windowInstance._faceBitmap.isReady === 'function' && windowInstance._faceBitmap.isReady()) {
                    drawMessageFaceIfNeeded(windowInstance);
                    windowInstance._faceBitmap = null;
                    return true;
                }
            } catch (_) {}
            return false;
        }

        /**
         * Create the engine text state needed to replay a translated message.
         */
        function createNativeTextState(windowInstance, text, overrides = {}) {
            const wrappedText = wrapMessageText(windowInstance, text);
            const coords = resolveMessageStartCoordinates(windowInstance, overrides);
            if (typeof windowInstance.createTextState === 'function') {
                const textState = windowInstance.createTextState(wrappedText, 0, coords.y, 0);
                const startX = Number.isFinite(coords.x)
                    ? coords.x
                    : (typeof windowInstance.newLineX === 'function' ? windowInstance.newLineX(textState) : 0);
                textState.x = startX;
                textState.startX = startX;
                if (Number.isFinite(coords.y)) {
                    textState.y = coords.y;
                    if (typeof textState.startY === 'number') textState.startY = coords.y;
                }
                return textState;
            }
            return { index: 0, text: wrappedText };
        }

        /**
         * Snapshot the native message timing state before a visual-only preview redraw.
         */
        function captureNativePreviewState(windowInstance) {
            if (!windowInstance) return null;
            return {
                pause: !!windowInstance.pause,
                waitCount: Number(windowInstance._waitCount) || 0,
                showFast: windowInstance._showFast,
                lineShowFast: windowInstance._lineShowFast,
                pauseSkip: windowInstance._pauseSkip,
                textState: windowInstance._textState,
            };
        }

        /**
         * Restore the native message timing state after a preview redraw.
         */
        function restoreNativePreviewState(windowInstance, snapshot) {
            if (!windowInstance || !snapshot) return;
            windowInstance.pause = snapshot.pause;
            windowInstance._waitCount = snapshot.waitCount;
            windowInstance._showFast = snapshot.showFast;
            windowInstance._lineShowFast = snapshot.lineShowFast;
            windowInstance._pauseSkip = snapshot.pauseSkip;
            windowInstance._textState = snapshot.textState;
        }

        /**
         * Replay a prepared message text state through the native renderer.
         */
        function flushNativeText(windowInstance, options = {}) {
            if (!windowInstance || !windowInstance._textState) return false;
            const textState = windowInstance._textState;
            const previewMode = options.streamingPreview === true;
            const originalPause = !!windowInstance.pause;
            const originalWait = Number(windowInstance._waitCount) || 0;
            const previewState = previewMode
                ? (options.previewState || captureNativePreviewState(windowInstance))
                : null;
            windowInstance.pause = false;
            windowInstance._waitCount = 0;
            windowInstance._showFast = true;
            windowInstance._trBypassProcessCharacter = (windowInstance._trBypassProcessCharacter || 0) + 1;
            try {
                while (windowInstance._textState && !windowInstance.isEndOfText(textState)) {
                    if (typeof windowInstance.needsNewPage === 'function' && windowInstance.needsNewPage(textState)) {
                        windowInstance.newPage(textState);
                        windowInstance._showFast = true;
                        drawMessageFaceIfReady(windowInstance);
                    }
                    windowInstance.processCharacter(textState);
                    if (windowInstance.pause || windowInstance._waitCount > 0) break;
                }
                if (typeof windowInstance.flushTextState === 'function') windowInstance.flushTextState(textState);
                const isWaiting = typeof windowInstance.isWaiting === 'function'
                    ? windowInstance.isWaiting()
                    : (windowInstance.pause || windowInstance._waitCount > 0);
                if (!previewMode
                    && windowInstance._textState
                    && windowInstance.isEndOfText(textState)
                    && !isWaiting) {
                    windowInstance.onEndOfText();
                }
            } catch (error) {
                if (!previewMode) {
                    windowInstance.pause = originalPause;
                    windowInstance._waitCount = originalWait;
                }
                throw error;
            } finally {
                if (previewMode) restoreNativePreviewState(windowInstance, previewState);
                windowInstance._trBypassProcessCharacter = Math.max(0, (windowInstance._trBypassProcessCharacter || 1) - 1);
            }
            return true;
        }

        /**
         * Redraw through drawTextEx when native message replay is unavailable.
         */
        function redrawFallback(windowInstance, text, overrides = {}) {
            if (!windowInstance || !windowInstance.contents) return false;
            const previewMode = overrides.streamingPreview === true;
            const previewState = previewMode
                ? (overrides.previewState || captureNativePreviewState(windowInstance))
                : null;
            try { windowInstance.contents.clear(); } catch (_) {}
            if (typeof windowInstance.resetFontSettings === 'function') windowInstance.resetFontSettings();
            drawMessageFaceIfNeeded(windowInstance);

            const coords = resolveMessageStartCoordinates(windowInstance, overrides);
            const scaleScope = createTextScaleScope(windowInstance, scope.textScalePercent);
            windowInstance._trBypassProcessCharacter = (windowInstance._trBypassProcessCharacter || 0) + 1;
            try {
                windowInstance.drawTextEx(text, coords.x, coords.y);
                if (windowInstance._textState) windowInstance._textState.index = windowInstance._textState.text.length;
                windowInstance._showFast = true;
                windowInstance._lineShowFast = true;
            } finally {
                if (scaleScope) scaleScope.restore();
                if (previewMode) restoreNativePreviewState(windowInstance, previewState);
                windowInstance._trBypassProcessCharacter = Math.max(0, (windowInstance._trBypassProcessCharacter || 1) - 1);
            }
            return true;
        }

        /**
         * Redraw a translated message with native message mechanics when possible.
         */
        function redrawGameMessageText(windowInstance, text, overrides = {}) {
            if (!windowInstance || !windowInstance.contents) return false;
            markDedicatedMessageWindow(windowInstance);
            const previewState = overrides.streamingPreview === true
                ? captureNativePreviewState(windowInstance)
                : null;
            if (!canUseNativeRender(windowInstance)) {
                disposeTextScaleScope(windowInstance);
                return redrawFallback(windowInstance, text, Object.assign({}, overrides, { previewState }));
            }

            try {
                ensureTextScaleScope(windowInstance);
                const textState = createNativeTextState(windowInstance, text, overrides);
                windowInstance._textState = textState;
                windowInstance.newPage(textState);
                if (typeof windowInstance.updatePlacement === 'function') windowInstance.updatePlacement();
                if (typeof windowInstance.updateBackground === 'function') windowInstance.updateBackground();
                if (typeof windowInstance.open === 'function') windowInstance.open();
                drawMessageFaceIfReady(windowInstance);
                windowInstance._trMsgStartX = typeof textState.startX === 'number'
                    ? textState.startX
                    : (typeof textState.left === 'number' ? textState.left : resolveMessageStartCoordinates(windowInstance, overrides).x);
                windowInstance._trMsgStartY = typeof textState.startY === 'number'
                    ? textState.startY
                    : (typeof textState.y === 'number' ? textState.y : 0);
                windowInstance._trWrappedMessageText = String(textState.text || text || '');
                return flushNativeText(windowInstance, Object.assign({}, overrides, { previewState }));
            } catch (error) {
                disposeTextScaleScope(windowInstance);
                warn('[GameMessage] Native render failed; falling back to drawTextEx redraw.', error);
                return redrawFallback(windowInstance, text, Object.assign({}, overrides, { previewState }));
            }
        }

        /**
         * Redraw immediately or queue a pending redraw until the window opens.
         */
        function redrawMessageText(windowInstance, text, sessionId, overrides = {}) {
            if (!windowInstance) return false;
            const coords = resolveMessageStartCoordinates(windowInstance, overrides);
            const deferUntilUpdate = overrides.deferUntilUpdate === true;
            const shouldDefer = deferUntilUpdate || shouldDeferMessageRedraw(windowInstance);
            if (shouldDefer || !isMessageWindowReadyForRedraw(windowInstance)) {
                const recordId = windowInstance._trMessageRecordId || '';
                const screenState = getMessageScreenState(windowInstance);
                windowInstance._trPendingRedraw = {
                    text,
                    sessionId,
                    x: coords.x,
                    y: coords.y,
                    recordId,
                    record: resolveMessageRecord(recordId),
                    screenState,
                    renderEvent: overrides.renderEvent || null,
                    renderDecision: overrides.renderDecision || null,
                    streamingPreview: overrides.streamingPreview === true,
                };
                // The orchestrator has produced a render command, but the native
                // Window_Message surface is not ready. Keep this as a draw
                // decision, not item.rendered, until pixels are actually applied.
                recordDecision(windowInstance._trPendingRedraw.record || recordId, 'draw.deferred', shouldDefer
                    ? (deferUntilUpdate
                        ? 'message redraw queued for the next window update'
                        : 'message redraw deferred until native setup settles')
                    : 'message window not ready for redraw', {
                    sessionId,
                    screenState,
                    windowType: getWindowType(windowInstance),
                    reason: shouldDefer
                        ? (deferUntilUpdate ? 'message-update-cycle' : 'message-processing')
                        : 'message-window-not-ready',
                });
                return false;
            }
            return redrawGameMessageText(windowInstance, text, overrides);
        }

        /**
         * Check whether a pending message redraw can safely touch contents now.
         */
        function isMessageWindowReadyForRedraw(windowInstance) {
            if (!windowInstance || !windowInstance.contents || windowInstance.visible === false) return false;
            return typeof windowInstance.isOpen === 'function' ? windowInstance.isOpen() : true;
        }

        function shouldDeferMessageRedraw(windowInstance) {
            return !!(windowInstance && windowInstance._trProcessCompleteMessageDepth > 0);
        }

        /**
         * Apply a deferred message redraw once the window has finished opening.
         */
        function applyPendingMessageRedraw(windowInstance) {
            const pending = windowInstance && windowInstance._trPendingRedraw;
            if (!pending) return false;
            if (!isMessageWindowReadyForRedraw(windowInstance)) return false;
            if (pending.sessionId && !isSessionCurrent(windowInstance, pending.sessionId)) {
                rejectPendingMessageRender(windowInstance, 'message-session-replaced', {
                    sessionId: pending.sessionId,
                    screenState: getMessageScreenState(windowInstance),
                    windowType: getWindowType(windowInstance),
                });
                windowInstance._trPendingRedraw = null;
                return false;
            }

            const applied = redrawGameMessageText(windowInstance, pending.text, pending);
            if (!applied) return false;
            windowInstance._trPendingRedraw = null;
            const recordId = pending.recordId || windowInstance._trMessageRecordId;
            const record = pending.record || resolveMessageRecord(recordId);
            // This event marks the point where a previously queued draw reached
            // the surface. If the pending redraw came from a render command,
            // item.rendered is emitted here rather than at queue time.
            recordDecision(record, 'draw.deferred_applied', 'deferred message redraw applied', {
                sessionId: pending.sessionId,
                screenState: getMessageScreenState(windowInstance),
                windowType: getWindowType(windowInstance),
                deferred: true,
            });
            if (pending.renderEvent) markMessageRendered(record, pending.renderEvent.text, pending.renderEvent.details, {
                deferred: true,
            });
            acceptPendingMessageRender(record, pending, {
                sessionId: pending.sessionId,
                screenState: getMessageScreenState(windowInstance),
                windowType: getWindowType(windowInstance),
                deferred: true,
            });
            return true;
        }

        function createPendingRenderDecision(command, route = {}, details = {}) {
            if (!command) return null;
            return {
                commandId: command.id ? String(command.id) : '',
                strategy: route && route.strategy ? String(route.strategy) : MESSAGE_RENDER_STRATEGY,
                commandGeneration: Number(route && route.commandGeneration) || 0,
                reason: 'message-redraw-deferred',
                details: Object.assign({}, details || {}),
            };
        }

        function acceptPendingMessageRender(record, pending, details = {}) {
            if (!pending || !pending.renderDecision) return null;
            const decision = Object.assign({}, pending.renderDecision, {
                reason: 'rendered',
                details: Object.assign({}, pending.renderDecision.details || {}, details || {}),
            });
            return recordRenderAccepted(record || pending.record, decision);
        }

        function rejectPendingMessageRender(windowInstance, reason, details = {}) {
            const pending = windowInstance && windowInstance._trPendingRedraw;
            if (!pending || !pending.renderDecision) return false;
            const decision = Object.assign({}, pending.renderDecision, {
                reason: reason || 'message-redraw-rejected',
                details: Object.assign({}, pending.renderDecision.details || {}, details || {}),
            });
            recordRenderRejected(pending.record || pending.recordId, decision);
            return true;
        }

        function clearPendingMessageRedraw(windowInstance, reason, details = {}) {
            if (!windowInstance || !windowInstance._trPendingRedraw) return false;
            rejectPendingMessageRender(windowInstance, reason || 'message-redraw-cleared', details);
            windowInstance._trPendingRedraw = null;
            return true;
        }

        return {
            canUseNativeRender,
            drawMessageFaceIfReady,
            createNativeTextState,
            flushNativeText,
            redrawFallback,
            redrawGameMessageText,
            redrawMessageText,
            isMessageWindowReadyForRedraw,
            shouldDeferMessageRedraw,
            applyPendingMessageRedraw,
            createPendingRenderDecision,
            acceptPendingMessageRender,
            rejectPendingMessageRender,
            clearPendingMessageRedraw,
        };
    }

    defineRuntimeModule('adapters.gameMessage.redraw', { create: createController });
})();
