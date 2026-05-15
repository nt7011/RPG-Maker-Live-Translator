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

    function createController(scope = {}) {
        const { globalScope, diag, preview, stripControls, registeredWindows, pruneDetachedRegisteredWindows, trackedMessageWindows } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { getGameMessageForWindow, isMessageWindowLike, markDedicatedMessageWindow, createEscapeAwarePayload, getResolvedTextForWindow, disposeTextScaleScope, applyPendingMessageRedraw, clearPendingMessageRedraw, processCompleteMessage, hasHookInChain, clearRecordFields, detachCurrentMessageRecord, updateRecordVisibility, rememberPendingBitmapGlyphSource, forgetPendingBitmapGlyphSource, resetStreamState, getMessageScreenState, warn, isAdapterContractFailure } = Object.fromEntries(['getGameMessageForWindow', 'isMessageWindowLike', 'markDedicatedMessageWindow', 'createEscapeAwarePayload', 'getResolvedTextForWindow', 'disposeTextScaleScope', 'applyPendingMessageRedraw', 'clearPendingMessageRedraw', 'processCompleteMessage', 'hasHookInChain', 'clearRecordFields', 'detachCurrentMessageRecord', 'updateRecordVisibility', 'rememberPendingBitmapGlyphSource', 'forgetPendingBitmapGlyphSource', 'resetStreamState', 'getMessageScreenState', 'warn', 'isAdapterContractFailure'].map((name) => [name, callScope(name)]));

        /**
         * Create a stable mutable state object for one message window.
         */
        function createMessageState() {
            return {
                currentText: '',
                isActive: false,
                lastUpdate: 0,
                session: 0,
                source: null,
            };
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
            windowInstance._trMessageSession = state.session;
            windowInstance._trStartedThisSession = !!options.started;
            windowInstance._trSentTranslateThisSession = false;
            windowInstance._trMsgStartSession = windowInstance._trMessageSession;
            windowInstance._trCurrentMessagePayload = null;
            clearPendingMessageRedraw(windowInstance, 'message-session-replaced', {
                sessionId: state.session,
            });
            windowInstance._trWrappedMessageText = null;
            resetStreamState(windowInstance);
            return state;
        }

        /**
         * Clear a window session after Game_Message.clear or window teardown.
         */
        function resetWindowMessageState(windowInstance) {
            if (!windowInstance) return null;
            detachCurrentMessageRecord(windowInstance, 'message-cleared');
            const renderRetained = windowInstance._trMessageRenderRetained === true;
            forgetPendingBitmapGlyphSource(windowInstance);
            const state = getMessageState(windowInstance);
            state.currentText = '';
            state.isActive = false;
            state.lastUpdate = Date.now();
            if (!renderRetained) {
                state.session += 1;
                disposeTextScaleScope(windowInstance);
                windowInstance._trStartedThisSession = false;
                windowInstance._trSentTranslateThisSession = false;
                windowInstance._trMsgStartSession = null;
                windowInstance._trCurrentMessagePayload = null;
                windowInstance._trMsgStartX = undefined;
                windowInstance._trMsgStartY = undefined;
                windowInstance._trSessionId = null;
                clearPendingMessageRedraw(windowInstance, 'message-cleared', {
                    sessionId: state.session,
                });
                windowInstance._trWrappedMessageText = null;
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
            return !!(windowInstance
                && windowInstance._trSessionId === sessionId
                && (state.isActive || windowInstance._trMessageRenderRetained === true)
                && state.session === sessionId);
        }

        /**
         * Decide whether a request token still belongs to this window/session.
         */
        function isCurrentTranslation(windowInstance, sessionId, requestToken) {
            return !!(windowInstance
                && requestToken
                && windowInstance._trMessageRequestToken === requestToken
                && windowInstance._trMessageTranslationSessionId === sessionId
                && windowInstance._trMessageRecordId
                && isSessionCurrent(windowInstance, sessionId));
        }

        /**
         * Capture the native text-state start position after RPG Maker starts a message.
         */
        function captureTextStateStart(windowInstance) {
            try {
                const textState = windowInstance && windowInstance._textState;
                if (!textState) return;
                if (typeof textState.startX === 'number') windowInstance._trMsgStartX = textState.startX;
                else if (typeof textState.x === 'number') windowInstance._trMsgStartX = textState.x;
                if (typeof textState.y === 'number') windowInstance._trMsgStartY = textState.y;
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
            try {
                Ctor.prototype._trHasDedicatedTextHook = true;
                Ctor._trHasDedicatedTextHook = true;
            } catch (_) {}
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
            if (!windowInstance || !windowInstance._trMessageRecordId) return;
            const screenState = getMessageScreenState(windowInstance);
            if (screenState === 'visible') {
                updateRecordVisibility(windowInstance, screenState);
                return;
            }
            const hasPendingText = messageHasQueuedText(windowInstance);
            if (hasPendingText && !windowInstance._trMessageSeenVisible) {
                updateRecordVisibility(windowInstance, screenState, { opening: true });
                return;
            }
            detachCurrentMessageRecord(windowInstance, reason || `message-window-${screenState}`, {
                screenState,
                hasPendingText,
                forceDetach: windowInstance._trMessageRenderRetained === true,
            });
        }

        /**
         * Detect whether a message window still has native queued text.
         */
        function messageHasQueuedText(windowInstance) {
            const gameMessage = getGameMessageForWindow(windowInstance);
            try {
                if (gameMessage && typeof gameMessage.hasText === 'function') return !!gameMessage.hasText();
            } catch (_) {}
            try {
                if (gameMessage && typeof gameMessage.allText === 'function') return !!String(gameMessage.allText() || '').trim();
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
            if (!windowInstance._trSentTranslateThisSession) {
                windowInstance._trSentTranslateThisSession = true;
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
            try {
                Ctor.prototype._trHasDedicatedTextHook = true;
                Ctor._trHasDedicatedTextHook = true;
            } catch (_) {}
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

                const state = getMessageState(this);
                if (state.isActive
                    && this._trStartedThisSession
                    && this._trSentTranslateThisSession
                    && this._trMessageSession === state.session) {
                    return original.call(this, textState);
                }

                const sourceText = textState && textState.text ? String(textState.text) : '';
                if (!this._trCurrentMessagePayload) prepareProcessCharacterPayload(this, sourceText);

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
            beginMessageSession(windowInstance, { started: false });
            const resolvedInfo = getResolvedTextForWindow(windowInstance);
            const hasResolvedText = resolvedInfo && typeof resolvedInfo.text === 'string' && resolvedInfo.text.length > 0;
            const resolved = hasResolvedText ? resolvedInfo.text : sourceText;
            windowInstance._trCurrentMessagePayload = createEscapeAwarePayload(resolved, 'processCharacter', {
                messageBreakInfo: hasResolvedText && resolvedInfo.messageBreakInfo,
                rawText: hasResolvedText ? resolvedInfo.rawText : sourceText,
                messageOrigin: resolvedInfo && resolvedInfo.messageOrigin,
            });
            rememberPendingBitmapGlyphSource(windowInstance, windowInstance._trCurrentMessagePayload);
        }

        /**
         * Report the fallback processCharacter payload once native text ends.
         */
        function completeProcessCharacterFallback(windowInstance, sourceText) {
            const payload = windowInstance._trCurrentMessagePayload || createEscapeAwarePayload(sourceText, 'processCharacter-final');
            windowInstance._trCurrentMessagePayload = null;
            const activeState = getMessageState(windowInstance);
            const finalText = payload ? payload.visible : stripControls(sourceText).trim();
            if (finalText && finalText !== activeState.currentText) {
                activeState.currentText = finalText;
                diag(`[GameMessage] Final rendered text: "${preview(finalText)}"`);
                windowInstance.processCompleteMessage(payload || sourceText, windowInstance._trMessageSession);
            } else if (payload) {
                windowInstance.processCompleteMessage(payload, windowInstance._trMessageSession);
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
            getMessageState,
            beginMessageSession,
            resetWindowMessageState,
            isSessionCurrent,
            isCurrentTranslation,
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
