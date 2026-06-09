// Game message adapter support: session.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/session.js.');
    }
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/game-message/session.js.');
    }
    const lifecycleReasons = requireRuntimeModule('runtime.lifecycleReasons').reasons;

    function createController(scope = {}) {
        const { globalScope, diag, preview, stripControls, registeredWindows, pruneDetachedRegisteredWindows, trackedMessageWindows, surfaceOwnership } = scope;
        const { getGameMessageForWindow, isMessageWindowLike, markDedicatedMessageWindow } = scope.controllerFacades.install;
        const { createEscapeAwarePayload, getResolvedTextForWindow } = scope.controllerFacades.text;
        const { readMessageOriginText, readMessageTextData } = scope.controllerFacades.foresightContext;
        const { disposeTextScaleScope } = scope.controllerFacades.wrapping;
        const { applyPendingMessageRedraw, clearPendingMessageRedraw } = scope.controllerFacades.redraw;
        const { processCompleteMessage } = scope.controllerFacades.detection;
        const { hasHookInChain, clearRecordFields, detachCurrentMessageRecord, updateRecordVisibility } = scope.controllerFacades.clear;
        const { rememberPendingBitmapGlyphSource, forgetPendingBitmapGlyphSource } = scope.controllerFacades.records;
        const { getMessageScreenState, warn, isAdapterContractFailure } = scope.controllerFacades.render;

        /**
         * Create a stable mutable state object for one message window.
         */
        function createMessageState() {
            return {
                currentText: '',
                currentPayload: null,
                isActive: false,
                lastUpdate: 0,
                session: 0,
                source: null,
                started: false,
                translationRequested: false,
                translationSessionId: null,
            };
        }

        /**
         * Create stream-preview state owned by the render session.
         *
         * The preview loop may stop while preserving text temporarily so
         * failure/skip paths can restore the source message. Keeping the
         * lifecycle in one object avoids orphaned preview fields on windows.
         */
        function createMessageStreamPreviewState() {
            return {
                abort: null,
                text: '',
                sessionId: null,
                loopActive: false,
                deferredLogged: false,
            };
        }

        /**
         * Create the adapter-owned start position for message redraws.
         */
        function createMessageStartState() {
            return {
                x: null,
                y: null,
                sessionId: null,
                wrappedText: '',
            };
        }

        /**
         * Create the render-session state for one Window_Message surface.
         *
         * This object is the adapter-owned source of truth for the current
         * render target, request token, retained render target, and queued
         * redraw. Mutation goes through these helpers so close/clear,
         * streaming, and retained-render transitions cannot drift apart.
         */
        function createMessageRenderSession() {
            return {
                recordId: '',
                record: null,
                payload: null,
                recordSessionId: 0,
                requestToken: null,
                translationSessionId: null,
                translationRecordId: '',
                translationPriority: null,
                seenVisible: false,
                onScreen: false,
                screenState: null,
                renderRetained: false,
                renderRetainedReason: '',
                pendingRedraw: null,
                streamPreview: createMessageStreamPreviewState(),
                messageStart: createMessageStartState(),
            };
        }

        function ensureMessageStreamPreviewState(renderSession) {
            if (!renderSession.streamPreview || typeof renderSession.streamPreview !== 'object') {
                renderSession.streamPreview = createMessageStreamPreviewState();
            }
            return renderSession.streamPreview;
        }

        function ensureMessageStartState(renderSession) {
            if (!renderSession.messageStart || typeof renderSession.messageStart !== 'object') {
                renderSession.messageStart = createMessageStartState();
            }
            return renderSession.messageStart;
        }

        function getMessageRenderSession(windowInstance) {
            if (!windowInstance) {
                if (!scope.fallbackMessageRenderSession) {
                    scope.fallbackMessageRenderSession = createMessageRenderSession();
                }
                return scope.fallbackMessageRenderSession;
            }
            let session = windowInstance._trMessageRenderSession;
            if (!session || typeof session !== 'object') {
                session = createMessageRenderSession();
                try { windowInstance._trMessageRenderSession = session; } catch (_) {}
            }
            return session;
        }

        function attachMessageRecordSession(windowInstance, record, payload, sessionId, observation = {}) {
            const renderSession = getMessageRenderSession(windowInstance);
            renderSession.recordId = record && record.id ? String(record.id) : '';
            renderSession.record = record || null;
            renderSession.payload = payload || null;
            renderSession.recordSessionId = Number(sessionId) || 0;
            renderSession.seenVisible = observation && observation.onScreen === true;
            renderSession.onScreen = observation && observation.onScreen === true;
            renderSession.screenState = observation && observation.screenState ? observation.screenState : null;
            renderSession.renderRetained = false;
            renderSession.renderRetainedReason = '';
            return renderSession;
        }

        function clearMessageRenderSession(windowInstance, options = {}) {
            const renderSession = getMessageRenderSession(windowInstance);
            renderSession.recordId = '';
            renderSession.record = null;
            renderSession.payload = null;
            renderSession.recordSessionId = null;
            renderSession.requestToken = null;
            renderSession.translationSessionId = null;
            renderSession.translationRecordId = '';
            renderSession.translationPriority = null;
            renderSession.seenVisible = false;
            renderSession.onScreen = false;
            renderSession.screenState = null;
            renderSession.renderRetained = false;
            renderSession.renderRetainedReason = '';
            if (options.clearPendingRedraw !== false) renderSession.pendingRedraw = null;
            resetMessageStreamPreviewState(renderSession);
            resetMessageStartState(renderSession);
            return renderSession;
        }

        function setMessageRequestSession(windowInstance, requestToken, sessionId, recordId, priority) {
            const renderSession = getMessageRenderSession(windowInstance);
            renderSession.requestToken = requestToken || null;
            renderSession.translationSessionId = sessionId || null;
            renderSession.translationRecordId = recordId ? String(recordId) : '';
            renderSession.translationPriority = priority || null;
            return renderSession;
        }

        function clearMessageRequestSession(windowInstance, requestToken = null) {
            if (!windowInstance) {
                return { handled: false, changed: false, reason: 'missing-window' };
            }
            const renderSession = getMessageRenderSession(windowInstance);
            if (requestToken && renderSession.requestToken !== requestToken) {
                return {
                    handled: true,
                    changed: false,
                    reason: 'request-token-mismatch',
                    recordId: renderSession.recordId || '',
                };
            }
            const changed = !!(renderSession.requestToken
                || renderSession.translationSessionId
                || renderSession.translationRecordId
                || renderSession.translationPriority);
            renderSession.requestToken = null;
            renderSession.translationSessionId = null;
            renderSession.translationRecordId = '';
            renderSession.translationPriority = null;
            return {
                handled: true,
                changed,
                reason: changed ? 'request-cleared' : 'request-empty',
                recordId: renderSession.recordId || '',
            };
        }

        function setMessageRenderRetained(windowInstance, retained, reason = '') {
            const renderSession = getMessageRenderSession(windowInstance);
            renderSession.renderRetained = retained === true;
            renderSession.renderRetainedReason = retained === true ? String(reason || 'message-detached') : '';
            return renderSession;
        }

        function updateMessageVisibilitySession(windowInstance, screenState, options = {}) {
            const renderSession = getMessageRenderSession(windowInstance);
            const nextScreenState = options.opening ? 'opening' : (screenState || renderSession.screenState || null);
            const onScreen = nextScreenState === 'visible';
            const changed = renderSession.screenState !== nextScreenState
                || renderSession.onScreen !== onScreen
                || (onScreen && renderSession.seenVisible !== true);
            renderSession.screenState = nextScreenState;
            renderSession.onScreen = onScreen;
            if (onScreen) renderSession.seenVisible = true;
            return { renderSession, changed, screenState: nextScreenState, onScreen };
        }

        function setPendingMessageRedrawSession(windowInstance, pending) {
            const renderSession = getMessageRenderSession(windowInstance);
            renderSession.pendingRedraw = pending || null;
            return renderSession.pendingRedraw;
        }

        function getPendingMessageRedrawSession(windowInstance) {
            return getMessageRenderSession(windowInstance).pendingRedraw || null;
        }

        function clearPendingMessageRedrawSession(windowInstance, pending = null) {
            const renderSession = getMessageRenderSession(windowInstance);
            if (pending && renderSession.pendingRedraw !== pending) {
                return { handled: true, changed: false, reason: 'pending-redraw-mismatch' };
            }
            const changed = !!renderSession.pendingRedraw;
            renderSession.pendingRedraw = null;
            return {
                handled: true,
                changed,
                reason: changed ? 'pending-redraw-cleared' : 'pending-redraw-empty',
            };
        }

        function getMessageStreamPreviewSession(windowInstance) {
            return ensureMessageStreamPreviewState(getMessageRenderSession(windowInstance));
        }

        function resetMessageStreamPreviewState(renderSession, options = {}) {
            const streamPreview = ensureMessageStreamPreviewState(renderSession);
            streamPreview.abort = null;
            if (options.preserveText !== true) streamPreview.text = '';
            streamPreview.sessionId = null;
            streamPreview.loopActive = false;
            streamPreview.deferredLogged = false;
            return streamPreview;
        }

        function beginMessageStreamPreview(windowInstance, sessionId) {
            clearPendingStreamPreviewSession(windowInstance);
            const streamPreview = getMessageStreamPreviewSession(windowInstance);
            streamPreview.abort = null;
            streamPreview.text = '';
            streamPreview.sessionId = sessionId || null;
            streamPreview.loopActive = false;
            streamPreview.deferredLogged = false;
            return streamPreview;
        }

        function setMessageStreamPreviewText(windowInstance, text, sessionId = null) {
            const streamPreview = getMessageStreamPreviewSession(windowInstance);
            streamPreview.text = String(text || '');
            if (sessionId !== null && sessionId !== undefined) streamPreview.sessionId = sessionId;
            return streamPreview;
        }

        function getMessageStreamPreviewText(windowInstance) {
            const streamPreview = getMessageStreamPreviewSession(windowInstance);
            return typeof streamPreview.text === 'string' ? streamPreview.text : '';
        }

        function isMessageStreamPreviewCurrent(windowInstance, sessionId) {
            if (!windowInstance) return false;
            const streamPreview = getMessageStreamPreviewSession(windowInstance);
            return streamPreview.sessionId === sessionId;
        }

        function stopMessageStreamPreview(windowInstance, sessionId, options = {}) {
            if (!windowInstance) {
                return { handled: false, changed: false, reason: 'missing-window' };
            }
            const renderSession = getMessageRenderSession(windowInstance);
            const streamPreview = ensureMessageStreamPreviewState(renderSession);
            if (sessionId !== null && sessionId !== undefined && streamPreview.sessionId !== sessionId) {
                return {
                    handled: true,
                    changed: false,
                    reason: 'stream-preview-session-mismatch',
                };
            }
            const clearsText = options.preserveText !== true && !!streamPreview.text;
            const changed = clearsText
                || streamPreview.sessionId !== null
                || streamPreview.loopActive === true
                || streamPreview.deferredLogged === true
                || !!streamPreview.abort;
            resetMessageStreamPreviewState(renderSession, {
                preserveText: options.preserveText === true,
            });
            return {
                handled: true,
                changed,
                reason: changed ? 'stream-preview-stopped' : 'stream-preview-empty',
            };
        }

        function clearPendingStreamPreviewSession(windowInstance, sessionId = null) {
            const pending = getPendingMessageRedrawSession(windowInstance);
            if (!pending || pending.streamingPreview !== true) {
                return { handled: true, changed: false, reason: 'pending-stream-preview-empty' };
            }
            if (sessionId !== null && pending.sessionId && pending.sessionId !== sessionId) {
                return { handled: true, changed: false, reason: 'pending-stream-preview-session-mismatch' };
            }
            return clearPendingMessageRedrawSession(windowInstance, pending);
        }

        function resetStreamState(windowInstance) {
            if (!windowInstance) return null;
            clearPendingStreamPreviewSession(windowInstance);
            const renderSession = getMessageRenderSession(windowInstance);
            return resetMessageStreamPreviewState(renderSession);
        }

        function getMessageStartSession(windowInstance) {
            return ensureMessageStartState(getMessageRenderSession(windowInstance));
        }

        function resetMessageStartState(renderSession) {
            const messageStart = ensureMessageStartState(renderSession);
            messageStart.x = null;
            messageStart.y = null;
            messageStart.sessionId = null;
            messageStart.wrappedText = '';
            return messageStart;
        }

        function clearMessageStartSession(windowInstance) {
            if (!windowInstance) return null;
            return resetMessageStartState(getMessageRenderSession(windowInstance));
        }

        function setMessageStartCoordinates(windowInstance, coordinates = {}, options = {}) {
            const messageStart = getMessageStartSession(windowInstance);
            if (hasFiniteNumber(coordinates.x)) messageStart.x = Number(coordinates.x);
            if (hasFiniteNumber(coordinates.y)) messageStart.y = Number(coordinates.y);
            if (options.sessionId !== undefined) {
                messageStart.sessionId = options.sessionId === null ? null : (Number(options.sessionId) || null);
            }
            if (Object.prototype.hasOwnProperty.call(options, 'wrappedText')) {
                messageStart.wrappedText = String(options.wrappedText || '');
            }
            return messageStart;
        }

        function getMessageStartCoordinates(windowInstance) {
            const messageStart = getMessageStartSession(windowInstance);
            return {
                x: messageStart.x,
                y: messageStart.y,
                sessionId: messageStart.sessionId,
                wrappedText: messageStart.wrappedText,
            };
        }

        function hasFiniteNumber(value) {
            return typeof value === 'number' && Number.isFinite(value);
        }

        /**
         * Return a message window state, creating and registering it if needed.
         */
        function getMessageState(windowInstance) {
            if (!windowInstance) return scope.fallbackMessageState;
            let state = windowInstance._trGameMessageState;
            if (!state) {
                state = createMessageState();
                try { windowInstance._trGameMessageState = state; } catch (_) {}
            }
            const source = getGameMessageForWindow(windowInstance);
            state.source = source;
            try { windowInstance._trGameMessageSource = source; } catch (_) {}
            trackedMessageWindows.add(windowInstance);
            markDedicatedMessageWindow(windowInstance);
            return state;
        }

        /**
         * Begin a new logical message session for a window.
         */
        function beginMessageSession(windowInstance, options = {}) {
            const state = getMessageState(windowInstance);
            detachCurrentMessageRecord(windowInstance, 'message-session-replaced');
            forgetPendingBitmapGlyphSource(windowInstance);
            state.session += 1;
            state.isActive = true;
            state.lastUpdate = Date.now();
            state.started = !!options.started;
            state.translationRequested = false;
            state.translationSessionId = null;
            state.currentPayload = null;
            clearPendingMessageRedraw(windowInstance, 'message-session-replaced', {
                sessionId: state.session,
            });
            clearMessageStartSession(windowInstance);
            resetStreamState(windowInstance);
            return state;
        }

        /**
         * Clear a window session after Game_Message.clear or window teardown.
         */
        function resetWindowMessageState(windowInstance) {
            if (!windowInstance) return null;
            detachCurrentMessageRecord(windowInstance, 'message-cleared');
            const renderRetained = getMessageRenderSession(windowInstance).renderRetained === true;
            forgetPendingBitmapGlyphSource(windowInstance);
            const state = getMessageState(windowInstance);
            state.currentText = '';
            state.isActive = false;
            state.lastUpdate = Date.now();
            if (!renderRetained) {
                state.session += 1;
                state.started = false;
                state.translationRequested = false;
                state.translationSessionId = null;
                state.currentPayload = null;
                disposeTextScaleScope(windowInstance);
                clearPendingMessageRedraw(windowInstance, 'message-cleared', {
                    sessionId: state.session,
                });
                clearMessageStartSession(windowInstance);
                clearRecordFields(windowInstance);
                resetStreamState(windowInstance);
            }
            return state;
        }

        /**
         * Decide whether a message session still owns a render target.
         */
        function isSessionCurrent(windowInstance, sessionId) {
            const state = getMessageState(windowInstance);
            const renderSession = getMessageRenderSession(windowInstance);
            return !!(windowInstance
                && state.translationSessionId === sessionId
                && (state.isActive || renderSession.renderRetained === true)
                && state.session === sessionId);
        }

        function getCurrentMessageSessionId(windowInstance) {
            const state = getMessageState(windowInstance);
            return Number(state.session) || 0;
        }

        function setMessageTranslationSession(windowInstance, sessionId) {
            const state = getMessageState(windowInstance);
            state.translationSessionId = Number(sessionId) || null;
            return state;
        }

        function markMessageTranslationRequested(windowInstance) {
            const state = getMessageState(windowInstance);
            state.translationRequested = true;
            return state;
        }

        function getCurrentMessagePayload(windowInstance) {
            const state = getMessageState(windowInstance);
            return state.currentPayload || null;
        }

        function setCurrentMessagePayload(windowInstance, payload) {
            const state = getMessageState(windowInstance);
            state.currentPayload = payload || null;
            return state.currentPayload;
        }

        function takeCurrentMessagePayload(windowInstance) {
            const state = getMessageState(windowInstance);
            const payload = state.currentPayload || null;
            state.currentPayload = null;
            return payload;
        }

        /**
         * Decide whether a request token still belongs to this window/session.
         */
        function isCurrentTranslation(windowInstance, sessionId, requestToken) {
            const renderSession = getMessageRenderSession(windowInstance);
            return !!(windowInstance
                && requestToken
                && renderSession.requestToken === requestToken
                && renderSession.translationSessionId === sessionId
                && renderSession.recordId
                && isSessionCurrent(windowInstance, sessionId));
        }

        /**
         * Capture the native text-state start position after RPG Maker starts a message.
         */
        function captureTextStateStart(windowInstance) {
            try {
                const textState = windowInstance && windowInstance._textState;
                if (!textState) return;
                const state = windowInstance && windowInstance._trGameMessageState;
                setMessageStartCoordinates(windowInstance, {
                    x: typeof textState.startX === 'number' ? textState.startX : textState.x,
                    y: textState.y,
                }, {
                    sessionId: state && state.session,
                });
            } catch (_) {}
        }

        /**
         * Return all known windows associated with a Game_Message object.
         */
        function collectWindowsForGameMessage(gameMessage) {
            const matches = [];
            const seen = new Set();

            /**
             * Add a window if it is a message window bound to the requested source.
             */
            function addIfMatch(windowInstance) {
                if (!windowInstance || seen.has(windowInstance) || !isMessageWindowLike(windowInstance)) return;
                const state = windowInstance._trGameMessageState || null;
                const source = (state && state.source)
                    || windowInstance._trGameMessageSource
                    || getGameMessageForWindow(windowInstance);
                if (source !== gameMessage) return;
                seen.add(windowInstance);
                matches.push(windowInstance);
            }

            trackedMessageWindows.forEach(addIfMatch);
            try {
                if (pruneDetachedRegisteredWindows) pruneDetachedRegisteredWindows();
                if (registeredWindows && typeof registeredWindows.forEach === 'function') registeredWindows.forEach(addIfMatch);
            } catch (_) {}
            collectSceneMessageWindows(addIfMatch);
            return matches;
        }

        /**
         * Visit likely message windows attached to the current scene.
         */
        function collectSceneMessageWindows(addWindow) {
            try {
                const scene = typeof SceneManager !== 'undefined' && SceneManager ? SceneManager._scene : null;
                if (!scene) return;
                Object.keys(scene).forEach((key) => {
                    const value = scene[key];
                    if (isMessageWindowLike(value)) {
                        addWindow(value);
                    } else if (Array.isArray(value)) {
                        value.forEach((item) => {
                            if (isMessageWindowLike(item)) addWindow(item);
                        });
                    }
                });
            } catch (_) {}
        }

        /**
         * Ensure createContents marks message contents as owned by the message adapter.
         */
        function wrapMessageContents(Ctor) {
            if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.createContents !== 'function') return;
            rememberDedicatedMessageConstructor(Ctor);
            if (hasHookInChain(Ctor.prototype.createContents, '__trGameMessageContentsWrapped', true)) return;
            const originalCreateContents = Ctor.prototype.createContents;
            // Mark every newly created contents bitmap as message-owned.
            Ctor.prototype.createContents = function(...args) {
                const result = originalCreateContents.apply(this, args);
                markDedicatedMessageWindow(this);
                return result;
            };
            Ctor.prototype.createContents.__trOriginal = originalCreateContents;
            Ctor.prototype.createContents.__trGameMessageContentsWrapped = true;
        }

        /**
         * Install visibility/destruction hooks for one message-window constructor.
         */
        function installLifecycleHooks(Ctor) {
            if (!Ctor || !Ctor.prototype) return;
            ['close', 'hide', 'destroy'].forEach((methodName) => wrapLifecycleMethod(Ctor, methodName));
            wrapUpdateForVisibility(Ctor);
        }

        /**
         * Wrap a lifecycle method that detaches the current render target.
         */
        function wrapLifecycleMethod(Ctor, methodName) {
            const current = Ctor.prototype[methodName];
            if (typeof current !== 'function' || hasHookInChain(current, '__trGameMessageLifecycleWrapped', true)) return;
            const original = current;
            // Destroy invalidates the native object immediately. Close/hide are
            // visibility transitions, so classify them from the post-call
            // surface state instead of the method name alone.
            Ctor.prototype[methodName] = function(...args) {
                if (methodName === 'destroy') {
                    detachCurrentMessageRecord(this, `message-window-${methodName}`, {
                        forceDetach: true,
                    });
                    return original.apply(this, args);
                }
                const result = original.apply(this, args);
                updateMessageVisibilityFromWindow(this, `message-window-${methodName}`);
                return result;
            };
            Ctor.prototype[methodName].__trOriginal = original;
            Ctor.prototype[methodName].__trGameMessageLifecycleWrapped = true;
        }

        /**
         * Wrap update so visibility changes demote or detach active messages.
         */
        function wrapUpdateForVisibility(Ctor) {
            const current = Ctor.prototype.update;
            if (typeof current !== 'function' || hasHookInChain(current, '__trGameMessageLifecycleWrapped', true)) return;
            const original = current;
            // Poll message-window visibility after the native update changes state.
            Ctor.prototype.update = function(...args) {
                const result = original.apply(this, args);
                applyPendingMessageRedraw(this);
                updateMessageVisibilityFromWindow(this, 'message-window-offscreen');
                return result;
            };
            Ctor.prototype.update.__trOriginal = original;
            Ctor.prototype.update.__trGameMessageLifecycleWrapped = true;
        }

        /**
         * Update orchestrator priority/visibility or detach if the message left screen.
         */
        function updateMessageVisibilityFromWindow(windowInstance, reason) {
            const renderSession = windowInstance ? getMessageRenderSession(windowInstance) : null;
            if (!renderSession || !renderSession.recordId) return;
            const screenState = getMessageScreenState(windowInstance);
            if (screenState === 'visible') {
                updateRecordVisibility(windowInstance, screenState);
                return;
            }
            const hasPendingText = messageHasQueuedText(windowInstance);
            if (hasPendingText && !renderSession.seenVisible) {
                updateRecordVisibility(windowInstance, screenState, { opening: true });
                return;
            }
            const detachReason = screenState === 'inactive-scene'
                ? lifecycleReasons.NOT_CURRENT_SCENE
                : (reason || `message-window-${screenState}`);
            detachCurrentMessageRecord(windowInstance, detachReason, {
                screenState,
                hasPendingText,
                forceDetach: renderSession.renderRetained === true,
            });
        }

        /**
         * Detect whether a message window still has native queued text.
         */
        function messageHasQueuedText(windowInstance) {
            const gameMessage = getGameMessageForWindow(windowInstance);
            try {
                const data = readMessageTextData(gameMessage);
                if (data && data.hasOwnData) {
                    return data.lineCount > 0 || !!String(data.text || '').trim();
                }
            } catch (_) {}
            try {
                if (String(readMessageOriginText(gameMessage) || '').trim()) return true;
            } catch (_) {}
            try {
                if (gameMessage && typeof gameMessage.hasText === 'function') return !!gameMessage.hasText();
            } catch (_) {}
            try {
                const state = windowInstance && windowInstance._trGameMessageState;
                return !!(state && typeof state.currentText === 'string' && state.currentText.trim());
            } catch (_) {}
            return false;
        }

        /**
         * Wrap startMessage when the constructor owns or must own message start.
         */
        function installStartMessageHook(Ctor, force = false) {
            if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.startMessage !== 'function') return false;
            const ownsStart = Object.prototype.hasOwnProperty.call(Ctor.prototype, 'startMessage');
            if (!force && !ownsStart) return false;
            const current = Ctor.prototype.startMessage;
            if (hasHookInChain(current, '__trGameMessageStartWrapped', true)) return true;
            const original = current;
            // Let RPG Maker prepare the native message, then observe the resolved text.
            Ctor.prototype.startMessage = function(...args) {
                markDedicatedMessageWindow(this);
                disposeTextScaleScope(this);
                const result = original.apply(this, args);
                try { observeStartedMessage(this); } catch (error) {
                    if (isAdapterContractFailure(error)) throw error;
                    warn('[GameMessage] startMessage hook error', error);
                }
                return result;
            };
            Ctor.prototype.startMessage.__trOriginal = original;
            Ctor.prototype.startMessage.__trGameMessageStartWrapped = true;
            return true;
        }

        /**
         * Observe the complete message after native startMessage initializes text.
         */
        function observeStartedMessage(windowInstance) {
            const state = beginMessageSession(windowInstance, { started: true });
            captureTextStateStart(windowInstance);
            const resolvedInfo = getResolvedTextForWindow(windowInstance);
            const resolved = resolvedInfo && typeof resolvedInfo.text === 'string' ? resolvedInfo.text : '';
            const payload = createEscapeAwarePayload(resolved, 'start', {
                messageBreakInfo: resolvedInfo && resolvedInfo.messageBreakInfo,
                rawText: resolvedInfo && resolvedInfo.rawText,
                messageOrigin: resolvedInfo && resolvedInfo.messageOrigin,
            });
            const finalText = payload ? payload.visible : stripControls(resolved).trim();
            if (!finalText || finalText === state.currentText) return;
            state.currentText = finalText;
            diag(`[GameMessage] Final rendered text: "${preview(finalText)}"`);
            if (!state.translationRequested) {
                markMessageTranslationRequested(windowInstance);
                windowInstance.processCompleteMessage(payload || resolved, state.session);
            }
        }

        /**
         * Install every known message-window constructor.
         */
        function discoverAndHookMessageWindowCtors() {
            installMessageWindowCtorHooks(Window_Message, true);
            try {
                if (typeof Window_Message_Battle !== 'undefined') installMessageWindowCtorHooks(Window_Message_Battle, true);
            } catch (_) {}
            try {
                Object.keys(globalScope).forEach((key) => {
                    const Ctor = globalScope[key];
                    if (!Ctor || typeof Ctor !== 'function' || !Ctor.prototype || Ctor === Window_Message) return;
                    try {
                        if (Window_Message.prototype.isPrototypeOf(Ctor.prototype)) installMessageWindowCtorHooks(Ctor, false);
                    } catch (_) {}
                });
            } catch (_) {}
            collectSceneMessageWindows((windowInstance) => {
                try {
                    if (windowInstance && windowInstance.constructor) installMessageWindowCtorHooks(windowInstance.constructor, false);
                    markDedicatedMessageWindow(windowInstance);
                } catch (_) {}
            });
        }

        /**
         * Install all message-window wrappers on one constructor.
         */
        function installMessageWindowCtorHooks(Ctor, force = false) {
            if (!Ctor || !Ctor.prototype) return;
            wrapMessageContents(Ctor);
            installLifecycleHooks(Ctor);
            installStartMessageHook(Ctor, force);
            rememberDedicatedMessageConstructor(Ctor);
        }

        function rememberDedicatedMessageConstructor(Ctor) {
            if (!Ctor || !surfaceOwnership || typeof surfaceOwnership.rememberDedicatedTextConstructor !== 'function') return false;
            try {
                return surfaceOwnership.rememberDedicatedTextConstructor(Ctor, {
                    adapterId: 'message',
                    surfaceType: 'message',
                    role: 'message-window',
                    reason: 'message-adapter',
                }) === true;
            } catch (_) {
                return false;
            }
        }

        /**
         * Install processCharacter as a fallback for engines/plugins without startMessage.
         */
        function installProcessCharacterFallback() {
            const current = Window_Message.prototype.processCharacter;
            if (typeof current !== 'function' || hasHookInChain(current, '__trGameMessageProcessWrapped', true)) return;
            const original = current;
            // Fallback collector for engines/plugins that do not use startMessage normally.
            Window_Message.prototype.processCharacter = function(textState) {
                markDedicatedMessageWindow(this);
                if (this._trBypassProcessCharacter && this._trBypassProcessCharacter > 0) {
                    return original.call(this, textState);
                }
                // RPG Maker MZ and several message plugins run virtual text
                // states through processCharacter for layout measurement. Those
                // passes explicitly set drawing=false, so they must not create
                // or replace a logical message session.
                if (textState && textState.drawing === false) {
                    return original.call(this, textState);
                }

                const state = getMessageState(this);
                if (state.isActive
                    && state.started === true
                    && state.translationRequested === true) {
                    return original.call(this, textState);
                }

                const sourceText = textState && textState.text ? String(textState.text) : '';
                if (!getCurrentMessagePayload(this)) prepareProcessCharacterPayload(this, sourceText);

                const result = original.call(this, textState);
                if (textState && typeof textState.text === 'string' && textState.index >= textState.text.length) {
                    completeProcessCharacterFallback(this, sourceText);
                }
                return result;
            };
            Window_Message.prototype.processCharacter.__trOriginal = original;
            Window_Message.prototype.processCharacter.__trGameMessageProcessWrapped = true;
        }

        /**
         * Initialize fallback payload capture before processCharacter draws text.
         */
        function prepareProcessCharacterPayload(windowInstance, sourceText) {
            const state = beginMessageSession(windowInstance, { started: false });
            const resolvedInfo = getResolvedTextForWindow(windowInstance);
            const hasResolvedText = resolvedInfo && typeof resolvedInfo.text === 'string' && resolvedInfo.text.length > 0;
            const resolved = hasResolvedText ? resolvedInfo.text : sourceText;
            const payload = createEscapeAwarePayload(resolved, 'processCharacter', {
                messageBreakInfo: hasResolvedText && resolvedInfo.messageBreakInfo,
                rawText: hasResolvedText ? resolvedInfo.rawText : sourceText,
                messageOrigin: resolvedInfo && resolvedInfo.messageOrigin,
            });
            setCurrentMessagePayload(windowInstance, payload);
            rememberPendingBitmapGlyphSource(windowInstance, payload);
            return state;
        }

        /**
         * Report the fallback processCharacter payload once native text ends.
         */
        function completeProcessCharacterFallback(windowInstance, sourceText) {
            const payload = takeCurrentMessagePayload(windowInstance) || createEscapeAwarePayload(sourceText, 'processCharacter-final');
            const activeState = getMessageState(windowInstance);
            const finalText = payload ? payload.visible : stripControls(sourceText).trim();
            if (finalText && finalText !== activeState.currentText) {
                activeState.currentText = finalText;
                diag(`[GameMessage] Final rendered text: "${preview(finalText)}"`);
                windowInstance.processCompleteMessage(payload || sourceText, activeState.session);
            } else if (payload) {
                windowInstance.processCompleteMessage(payload, activeState.session);
            }
        }

        /**
         * Install the public processCompleteMessage adapter entry point.
         */
        function installProcessCompleteMessage() {
            // Expose a narrow adapter entry point used by both startMessage and fallback capture.
            Window_Message.prototype.processCompleteMessage = function(message, sessionId) {
                processCompleteMessage(this, message, sessionId);
            };
        }

        return {
            createMessageState,
            createMessageRenderSession,
            getMessageState,
            getMessageRenderSession,
            createMessageStreamPreviewState,
            createMessageStartState,
            attachMessageRecordSession,
            clearMessageRenderSession,
            setMessageRequestSession,
            clearMessageRequestSession,
            setMessageRenderRetained,
            updateMessageVisibilitySession,
            setPendingMessageRedrawSession,
            getPendingMessageRedrawSession,
            clearPendingMessageRedrawSession,
            getMessageStreamPreviewSession,
            beginMessageStreamPreview,
            setMessageStreamPreviewText,
            getMessageStreamPreviewText,
            isMessageStreamPreviewCurrent,
            stopMessageStreamPreview,
            clearPendingStreamPreviewSession,
            resetStreamState,
            getMessageStartSession,
            clearMessageStartSession,
            setMessageStartCoordinates,
            getMessageStartCoordinates,
            beginMessageSession,
            resetWindowMessageState,
            isSessionCurrent,
            isCurrentTranslation,
            getCurrentMessageSessionId,
            setMessageTranslationSession,
            markMessageTranslationRequested,
            getCurrentMessagePayload,
            setCurrentMessagePayload,
            takeCurrentMessagePayload,
            captureTextStateStart,
            collectWindowsForGameMessage,
            collectSceneMessageWindows,
            wrapMessageContents,
            installLifecycleHooks,
            wrapLifecycleMethod,
            wrapUpdateForVisibility,
            updateMessageVisibilityFromWindow,
            messageHasQueuedText,
            installStartMessageHook,
            observeStartedMessage,
            discoverAndHookMessageWindowCtors,
            installMessageWindowCtorHooks,
            installProcessCharacterFallback,
            prepareProcessCharacterPayload,
            completeProcessCharacterFallback,
            installProcessCompleteMessage,
        };
    }

    defineRuntimeModule('adapters.gameMessage.session', { create: createController });
})();
