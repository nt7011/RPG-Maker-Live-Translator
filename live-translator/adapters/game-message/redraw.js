// Game message adapter support: redraw.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.gameMessage.redraw',
        factory() {

    function createController(scope = {}) {
        const { MESSAGE_RENDER_STRATEGY } = scope;
        const NATIVE_RENDER_STALL_CODE = 'native-message-render-stalled';
        const { markDedicatedMessageWindow, drawMessageFaceIfNeeded, resolveMessageStartCoordinates } = scope.controllerFacades.install;
        const { createTextScaleScope, disposeTextScaleScope, ensureTextScaleScope, wrapMessageText } = scope.controllerFacades.wrapping;
        const { getWindowType, recordDecision, recordRenderCommitted, recordRenderRejected, resolveMessageRecord } = scope.controllerFacades.records;
        const { markMessageRendered, getMessageScreenState, warn } = scope.controllerFacades.render;
        const { isSessionCurrent, getMessageRenderSession, getPendingMessageRedrawSession, setPendingMessageRedrawSession, clearPendingMessageRedrawSession, setMessageStartCoordinates } = scope.controllerFacades.session;

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
                const nativeState = createNativeWindowTextState(windowInstance, wrappedText, coords, {
                    preconverted: overrides.preconverted === true,
                });
                if (nativeState) return normalizeNativeTextStateStart(windowInstance, nativeState, coords);
                if (overrides.preconverted !== true) return { index: 0, text: wrappedText };
            }
            return overrides.preconverted === true
                ? createPreconvertedTextState(windowInstance, wrappedText, coords)
                : { index: 0, text: wrappedText };
        }

        function createNativeWindowTextState(windowInstance, text, coords = {}, options = {}) {
            if (!windowInstance || typeof windowInstance.createTextState !== 'function') return null;
            const preconverted = options.preconverted === true;
            let restorePreconvertedConverter = null;
            try {
                restorePreconvertedConverter = preconverted
                    ? installPreconvertedEscapeConverter(windowInstance)
                    : null;
                const textState = windowInstance.createTextState(String(text || ''), 0, coords.y, 0);
                return textState && typeof textState === 'object' ? textState : null;
            } catch (error) {
                if (!preconverted) throw error;
                warn('[GameMessage] Native preconverted text state creation failed; using generic text state.', error);
                return null;
            } finally {
                if (restorePreconvertedConverter) restorePreconvertedConverter();
            }
        }

        function normalizeNativeTextStateStart(windowInstance, textState, coords = {}) {
            if (!textState || typeof textState !== 'object') return null;
            const startX = Number.isFinite(coords.x)
                ? coords.x
                : (typeof windowInstance.newLineX === 'function' ? windowInstance.newLineX(textState) : 0);
            textState.x = startX;
            textState.startX = startX;
            textState.left = startX;
            if (Number.isFinite(coords.y)) {
                textState.y = coords.y;
                textState.startY = coords.y;
            }
            return textState;
        }

        /**
         * Build a native-shaped text state without running convertEscapeCharacters.
         */
        function createPreconvertedTextState(windowInstance, text, coords = {}) {
            const x = Number.isFinite(Number(coords.x)) ? Number(coords.x) : 0;
            const y = Number.isFinite(Number(coords.y)) ? Number(coords.y) : 0;
            const height = typeof windowInstance.lineHeight === 'function'
                ? windowInstance.lineHeight()
                : 0;
            return {
                text: String(text || ''),
                index: 0,
                x,
                y,
                startX: x,
                startY: y,
                left: x,
                height,
                buffer: '',
                drawing: true,
            };
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
                let consumedText = false;
                while (windowInstance._textState && !windowInstance.isEndOfText(textState)) {
                    if (typeof windowInstance.needsNewPage === 'function' && windowInstance.needsNewPage(textState)) {
                        windowInstance.newPage(textState);
                        windowInstance._showFast = true;
                        drawMessageFaceIfReady(windowInstance);
                        if (isNativeMessageWaiting(windowInstance)) {
                            if (!previewMode && !consumedText) restoreNativeReplayTiming(windowInstance, originalPause, originalWait);
                            return consumedText;
                        }
                    }
                    const previousTextState = windowInstance._textState;
                    const previousIndex = readTextStateIndex(textState);
                    windowInstance.processCharacter(textState);
                    const progressed = hasNativeRenderProgress(windowInstance, textState, previousTextState, previousIndex);
                    const isWaiting = isNativeMessageWaiting(windowInstance);
                    if (progressed) consumedText = true;
                    if (!progressed && !isWaiting) {
                        throw createNativeRenderStallError(textState, previousIndex);
                    }
                    if (isWaiting) {
                        if (!consumedText) {
                            if (!previewMode) restoreNativeReplayTiming(windowInstance, originalPause, originalWait);
                            return false;
                        }
                        break;
                    }
                }
                if (typeof windowInstance.flushTextState === 'function') windowInstance.flushTextState(textState);
                const isWaiting = isNativeMessageWaiting(windowInstance);
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

        function restoreNativeReplayTiming(windowInstance, pause, waitCount) {
            if (!windowInstance) return;
            windowInstance.pause = pause;
            windowInstance._waitCount = waitCount;
        }

        function readTextStateIndex(textState) {
            const index = Number(textState && textState.index);
            return Number.isFinite(index) ? index : null;
        }

        function hasNativeRenderProgress(windowInstance, textState, previousTextState, previousIndex) {
            if (!windowInstance || windowInstance._textState !== previousTextState) return true;
            const currentIndex = readTextStateIndex(textState);
            return previousIndex !== null && currentIndex !== null && currentIndex > previousIndex;
        }

        function isNativeMessageWaiting(windowInstance) {
            if (!windowInstance) return false;
            try {
                if (typeof windowInstance.isWaiting === 'function') return !!windowInstance.isWaiting();
            } catch (_) {}
            return !!(windowInstance.pause || Number(windowInstance._waitCount) > 0);
        }

        function createNativeRenderStallError(textState, previousIndex) {
            const error = new Error('Native message renderer did not consume text or report a wait.');
            error.code = NATIVE_RENDER_STALL_CODE;
            error.previousIndex = previousIndex;
            error.currentIndex = readTextStateIndex(textState);
            error.textLength = String(textState && textState.text ? textState.text : '').length;
            return error;
        }

        function isNativeRenderStallError(error) {
            return !!(error && error.code === NATIVE_RENDER_STALL_CODE);
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
            const restorePreconvertedConverter = overrides.preconverted === true
                ? installPreconvertedEscapeConverter(windowInstance)
                : null;
            try {
                windowInstance.drawTextEx(text, coords.x, coords.y);
                finalizeFallbackBitmapDirty(windowInstance.contents, 'game-message-fallback-redraw');
                if (windowInstance._textState) windowInstance._textState.index = windowInstance._textState.text.length;
                windowInstance._showFast = true;
                windowInstance._lineShowFast = true;
            } finally {
                if (restorePreconvertedConverter) restorePreconvertedConverter();
                if (scaleScope) scaleScope.restore();
                if (previewMode) restoreNativePreviewState(windowInstance, previewState);
                windowInstance._trBypassProcessCharacter = Math.max(0, (windowInstance._trBypassProcessCharacter || 1) - 1);
            }
            return true;
        }

        function finalizeFallbackBitmapDirty(bitmap, reason) {
            const bitmapDraws = scope.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.markBitmapPixelsDirty !== 'function') return null;
            return bitmapDraws.markBitmapPixelsDirty(bitmap, {
                source: 'game-message-redraw',
                reason: String(reason || 'game-message-fallback-redraw'),
            });
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
                const startX = typeof textState.startX === 'number'
                    ? textState.startX
                    : (typeof textState.left === 'number' ? textState.left : resolveMessageStartCoordinates(windowInstance, overrides).x);
                const startY = typeof textState.startY === 'number'
                    ? textState.startY
                    : (typeof textState.y === 'number' ? textState.y : 0);
                setMessageStartCoordinates(windowInstance, {
                    x: startX,
                    y: startY,
                }, {
                    sessionId: overrides.sessionId,
                    wrappedText: String(textState.text || text || ''),
                });
                return flushNativeText(windowInstance, Object.assign({}, overrides, { previewState }));
            } catch (error) {
                disposeTextScaleScope(windowInstance);
                if (isNativeRenderStallError(error)) {
                    warn('[GameMessage] Native render stalled; rejecting message redraw.', error);
                    return false;
                }
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
                const renderSession = getMessageRenderSession(windowInstance);
                const recordId = renderSession.recordId || '';
                const screenState = getMessageScreenState(windowInstance);
                const pending = setPendingMessageRedrawSession(windowInstance, {
                    text,
                    sessionId,
                    x: coords.x,
                    y: coords.y,
                    preconverted: overrides.preconverted === true,
                    degradedPreview: overrides.degradedPreview === true,
                    recordId,
                    record: resolveMessageRecord(recordId),
                    screenState,
                    renderEvent: overrides.renderEvent || null,
                    renderDecision: overrides.renderDecision || null,
                    streamingPreview: overrides.streamingPreview === true,
                });
                // The orchestrator has produced a render command, but the native
                // Window_Message surface is not ready. Keep this as a draw
                // decision, not item.rendered, until pixels are actually applied.
                recordDecision(pending.record || recordId, 'draw.deferred', shouldDefer
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
            return redrawGameMessageText(windowInstance, text, Object.assign({}, overrides, { sessionId }));
        }

        /**
         * drawTextEx usually converts escapes internally. Preconverted redraws
         * have already passed through the isolated chamber, so conversion is
         * identity-scoped only for this draw call.
         */
        function installPreconvertedEscapeConverter(windowInstance) {
            if (!windowInstance) return null;
            const hadOwn = Object.prototype.hasOwnProperty.call(windowInstance, 'convertEscapeCharacters');
            const original = windowInstance.convertEscapeCharacters;
            windowInstance.convertEscapeCharacters = function(value) {
                return String(value || '');
            };
            return function restorePreconvertedEscapeConverter() {
                try {
                    if (hadOwn) windowInstance.convertEscapeCharacters = original;
                    else delete windowInstance.convertEscapeCharacters;
                } catch (_) {
                    try { windowInstance.convertEscapeCharacters = original; } catch (_) {}
                }
            };
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
            const pending = getPendingMessageRedrawSession(windowInstance);
            if (!pending) return false;
            if (!isMessageWindowReadyForRedraw(windowInstance)) return false;
            if (pending.sessionId && !isSessionCurrent(windowInstance, pending.sessionId)) {
                rejectPendingMessageRender(windowInstance, 'message-session-replaced', {
                    sessionId: pending.sessionId,
                    screenState: getMessageScreenState(windowInstance),
                    windowType: getWindowType(windowInstance),
                });
                clearPendingMessageRedrawSession(windowInstance, pending);
                return false;
            }

            const applied = redrawGameMessageText(windowInstance, pending.text, pending);
            if (!applied) return false;
            clearPendingMessageRedrawSession(windowInstance, pending);
            const recordId = pending.recordId || getMessageRenderSession(windowInstance).recordId;
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
            return recordRenderCommitted(record || pending.record, decision);
        }

        function rejectPendingMessageRender(windowInstance, reason, details = {}) {
            const pending = getPendingMessageRedrawSession(windowInstance);
            if (!pending || !pending.renderDecision) return false;
            const decision = Object.assign({}, pending.renderDecision, {
                reason: reason || 'message-redraw-rejected',
                details: Object.assign({}, pending.renderDecision.details || {}, details || {}),
            });
            recordRenderRejected(pending.record || pending.recordId, decision);
            return true;
        }

        function clearPendingMessageRedraw(windowInstance, reason, details = {}) {
            const pending = getPendingMessageRedrawSession(windowInstance);
            if (!windowInstance || !pending) return false;
            rejectPendingMessageRender(windowInstance, reason || 'message-redraw-cleared', details);
            return clearPendingMessageRedrawSession(windowInstance, pending).changed === true;
        }

        return {
            canUseNativeRender,
            drawMessageFaceIfReady,
            createNativeTextState,
            createPreconvertedTextState,
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
            installPreconvertedEscapeConverter,
            isNativeRenderStallError,
        };
    }

            return { create: createController };
        },
    });
})();
