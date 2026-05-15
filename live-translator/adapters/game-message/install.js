// Game message adapter support: install.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/install.js.');
    }

    function createController(scope = {}) {
        const { globalScope, diag, adapterContract, contentsOwners } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { discoverAndHookMessageWindowCtors, installProcessCharacterFallback, installProcessCompleteMessage, installGameInterpreterExecutionContextHook, installGameInterpreterChildOriginHook, installGameMessageAddOriginHook, installGameInterpreterMessageOriginHook, installGamePlayerTransferForesightHook, installGameMessageClearHook, installOrchestratorSubscription, getWindowId, updateItem, recordDecision, recordRenderAccepted, recordRenderDeferred, recordRenderRejected, backgroundItem, retireItem, warn } = Object.fromEntries(['discoverAndHookMessageWindowCtors', 'installProcessCharacterFallback', 'installProcessCompleteMessage', 'installGameInterpreterExecutionContextHook', 'installGameInterpreterChildOriginHook', 'installGameMessageAddOriginHook', 'installGameInterpreterMessageOriginHook', 'installGamePlayerTransferForesightHook', 'installGameMessageClearHook', 'installOrchestratorSubscription', 'getWindowId', 'updateItem', 'recordDecision', 'recordRenderAccepted', 'recordRenderDeferred', 'recordRenderRejected', 'backgroundItem', 'retireItem', 'warn'].map((name) => [name, callScope(name)]));

        /**
         * Install all Window_Message and Game_Message wrappers.
         */
        function install() {
            if (typeof Window_Message === 'undefined' || !Window_Message || !Window_Message.prototype) {
                diag('[GameMessage] Window_Message unavailable; skipping message hooks.');
                return { status: 'skipped', reason: 'Window_Message is unavailable.' };
            }
            if (!hasTextOrchestrator()) {
                diag('[GameMessage] Text orchestrator unavailable; skipping message hooks.');
                return { status: 'skipped', reason: 'Text orchestrator is unavailable.' };
            }

            exposeAdapterApi();
            installOrchestratorSubscription();
            discoverAndHookMessageWindowCtors();
            installProcessCharacterFallback();
            installProcessCompleteMessage();
            installGameMessageClearHook();
            if (scope.foresightEnabled) {
                installGameInterpreterExecutionContextHook();
                installGameInterpreterChildOriginHook();
                installGameMessageAddOriginHook();
                installGameInterpreterMessageOriginHook();
                installGamePlayerTransferForesightHook();
            }

            return {
                status: 'installed',
                reason: 'Window_Message adapter hooks installed.',
            };
        }

        /**
         * Check whether the orchestrator exposes the adapter contract we need.
         */
        function hasTextOrchestrator() {
            return !!(adapterContract
                && typeof adapterContract.hasRequiredMethods === 'function'
                && adapterContract.hasRequiredMethods([
                    'observeRecord',
                    'requestItemTranslation',
                    'cancelItemTranslation',
                    'updateItem',
                    'retireItem',
                    'backgroundItem',
                    'setItemTranslationPriority',
                    'setItemVisibility',
                    'recordDecision',
                    'recordRenderAccepted',
                    'recordRenderDeferred',
                    'recordRenderRejected',
                    'describeTextEligibility',
                    'claimSurface',
                    'releaseSurface',
                    'claimText',
                    'releaseTextClaim',
                    'subscribeRecords',
                ]));
        }

        /**
         * Resolve the Game_Message object that owns a message window.
         */
        function getGameMessageForWindow(windowInstance) {
            try {
                if (windowInstance && windowInstance._gameMessage && typeof windowInstance._gameMessage === 'object') {
                    return windowInstance._gameMessage;
                }
            } catch (_) {}
            try {
                if (typeof $gameMessage !== 'undefined' && $gameMessage && typeof $gameMessage === 'object') {
                    return $gameMessage;
                }
            } catch (_) {}
            return null;
        }

        /**
         * Identify core and subclassed message windows without game-specific names.
         */
        function isMessageWindowLike(windowInstance) {
            if (!windowInstance) return false;
            if (windowInstance._trHasDedicatedTextHook) return true;
            const ctor = windowInstance.constructor;
            if (ctor && ctor._trHasDedicatedTextHook) return true;
            try {
                if (typeof Window_Message !== 'undefined'
                    && Window_Message
                    && Window_Message.prototype
                    && Window_Message.prototype.isPrototypeOf(windowInstance)) {
                    return true;
                }
            } catch (_) {}
            const name = ctor && ctor.name ? String(ctor.name) : '';
            return /^Window_Message(?:$|_)/.test(name);
        }

        /**
         * Mark a message window and its contents so generic bitmap/window hooks bypass it.
         */
        function markDedicatedMessageWindow(windowInstance) {
            if (!windowInstance) return;
            try { windowInstance._trHasDedicatedTextHook = true; } catch (_) {}
            try {
                const ctor = windowInstance.constructor;
                if (ctor) ctor._trHasDedicatedTextHook = true;
            } catch (_) {}
            try {
                if (windowInstance.contents) {
                    windowInstance.contents._trHasDedicatedTextHook = true;
                    windowInstance.contents._trMessageContents = true;
                    if (contentsOwners && typeof contentsOwners.set === 'function') {
                        contentsOwners.set(windowInstance.contents, windowInstance);
                    }
                    claimMessageContentsSurface(windowInstance);
                }
            } catch (_) {}
        }

        function claimMessageContentsSurface(windowInstance) {
            if (!windowInstance || !windowInstance.contents) return false;
            if (!adapterContract || typeof adapterContract.claimSurface !== 'function') return false;
            if (windowInstance._trMessageContentsClaim
                && windowInstance._trMessageContentsClaimTarget === windowInstance.contents) {
                return true;
            }
            if (windowInstance._trMessageContentsClaim
                && typeof adapterContract.releaseSurface === 'function') {
                adapterContract.releaseSurface(windowInstance._trMessageContentsClaim, 'message-contents-replaced');
            }
            const claim = adapterContract.claimSurface({
                target: windowInstance.contents,
                surfaceId: `message:${getWindowId(windowInstance)}:contents`,
                surfaceType: 'message',
                role: 'message-contents',
                owner: windowInstance,
            });
            if (claim && claim.status === 'claimed' && claim.token) {
                windowInstance._trMessageContentsClaim = claim.token;
                windowInstance._trMessageContentsClaimTarget = windowInstance.contents;
                return true;
            }
            return false;
        }

        /**
         * Redraw the speaker face when the current message has one.
         */
        function drawMessageFaceIfNeeded(windowInstance) {
            try {
                const gameMessage = getGameMessageForWindow(windowInstance);
                if (windowInstance
                    && typeof windowInstance.drawMessageFace === 'function'
                    && gameMessage
                    && typeof gameMessage.faceName === 'function'
                    && gameMessage.faceName()) {
                    windowInstance.drawMessageFace();
                }
            } catch (_) {}
        }

        /**
         * Publish only a diagnostic marker. Cross-adapter ownership now flows
         * through the adapter contract instead of a message-specific global.
         */
        function exposeAdapterApi() {
            try {
                globalScope.LiveTranslatorGameMessageAdapter = {
                    __token: 'liveTranslator.gameMessageAdapter',
                };
            } catch (_) {}
        }

        /**
         * Resolve the original x/y message text start for faithful redraws.
         */
        function resolveMessageStartCoordinates(windowInstance, overrides = {}) {
            const hasNumber = (value) => typeof value === 'number' && Number.isFinite(value);
            if (!windowInstance) return { x: 0, y: 0 };

            let startX = hasNumber(overrides.x) ? overrides.x : undefined;
            let startY = hasNumber(overrides.y) ? overrides.y : undefined;
            if (!hasNumber(startX) && hasNumber(windowInstance._trMsgStartX)) startX = windowInstance._trMsgStartX;
            if (!hasNumber(startY) && hasNumber(windowInstance._trMsgStartY)) startY = windowInstance._trMsgStartY;

            try {
                const state = windowInstance._textState;
                if (state) {
                    if (!hasNumber(startX)) startX = hasNumber(state.startX) ? state.startX : state.x;
                    if (!hasNumber(startY) && hasNumber(state.y)) startY = state.y;
                }
                if (!hasNumber(startX)) {
                    if (typeof windowInstance.newLineX === 'function') {
                        startX = windowInstance.newLineX(state || undefined);
                    } else if (typeof windowInstance.textPadding === 'function') {
                        startX = windowInstance.textPadding();
                    }
                }
            } catch (error) {
                warn('[GameMessage] Failed to determine start coordinates; using fallback.', error);
                if (!hasNumber(startX) && typeof windowInstance.textPadding === 'function') startX = windowInstance.textPadding();
                if (!hasNumber(startY)) startY = 0;
            }

            return {
                x: hasNumber(startX) ? startX : 0,
                y: hasNumber(startY) ? startY : 0,
            };
        }

        return {
            install,
            hasTextOrchestrator,
            getGameMessageForWindow,
            isMessageWindowLike,
            markDedicatedMessageWindow,
            claimMessageContentsSurface,
            drawMessageFaceIfNeeded,
            exposeAdapterApi,
            resolveMessageStartCoordinates,
        };
    }

    defineRuntimeModule('adapters.gameMessage.install', { create: createController });
})();
