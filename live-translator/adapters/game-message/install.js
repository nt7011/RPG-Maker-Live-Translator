// Game message adapter support: install.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.gameMessage.install',
        requires: {
            hookWrapper: 'runtime.hookWrapper',
            conversionScope: 'runtime.conversionScope',
        },
        factory({ hookWrapper, conversionScope }) {

    function createController(scope = {}) {
        const { globalScope, traceLog, adapterContract, surfaceOwnership } = scope;
        const { installGameInterpreterExecutionContextHook, installGameInterpreterChildOriginHook, installGameMessageAddOriginHook, installGameInterpreterMessageOriginHook, installGamePlayerTransferForesightHook } = scope.controllerFacades.foresightHooks;
        const { installGameMessageClearHook } = scope.controllerFacades.clear;
        const { installOrchestratorSubscription, getWindowId } = scope.controllerFacades.records;
        const { warn } = scope.controllerFacades.render;
        const { discoverAndHookMessageWindowCtors, installProcessCharacterFallback, installProcessCompleteMessage, getMessageStartCoordinates } = scope.controllerFacades.session;
        const messageContentsClaims = new WeakMap();

        /**
         * Install all Window_Message and Game_Message wrappers.
         */
        function install() {
            if (typeof Window_Message === 'undefined' || !Window_Message || !Window_Message.prototype) {
                traceLog('[GameMessage] Window_Message unavailable; skipping message hooks.');
                return { status: 'skipped', reason: 'Window_Message is unavailable.' };
            }
            if (!hasTextOrchestrator()) {
                traceLog('[GameMessage] Text orchestrator unavailable; skipping message hooks.');
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
            installGameMessageConversionRouters();

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
                    'recordRenderCommitted',
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

        function installGameMessageConversionRouters() {
            const prototype = globalScope.Game_Message && globalScope.Game_Message.prototype;
            if (!prototype) return 0;
            let installed = 0;
            getPrototypeMethodNames(prototype).forEach((methodName) => {
                if (hookWrapper.installMethodWrapper(prototype, methodName, {
                    property: '__trGameMessageConversionRouter',
                    token: true,
                    createWrapper(original) {
                        return conversionScope.createMutationRouter(methodName, original);
                    },
                })) {
                    installed += 1;
                }
            });
            return installed;
        }

        function getPrototypeMethodNames(prototype) {
            const names = [];
            if (!prototype) return names;
            try {
                Object.getOwnPropertyNames(prototype).forEach((name) => {
                    if (!name || name === 'constructor') return;
                    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
                    if (!descriptor || typeof descriptor.value !== 'function') return;
                    names.push(name);
                });
            } catch (_) {}
            return names;
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
            if (isDedicatedTextOwner(windowInstance)) return true;
            try {
                if (typeof Window_Message !== 'undefined'
                    && Window_Message
                    && Window_Message.prototype
                    && Window_Message.prototype.isPrototypeOf(windowInstance)) {
                    return true;
                }
            } catch (_) {}
            // Constructor names are not ownership proof. Namebox plugins can use
            // Window_Message_* names while still drawing ordinary window text.
            return false;
        }

        /**
         * Mark a message window and its contents so generic bitmap/window hooks bypass it.
         */
        function markDedicatedMessageWindow(windowInstance) {
            if (!windowInstance) return;
            rememberDedicatedTextOwner(windowInstance);
            rememberDedicatedTextConstructor(windowInstance.constructor);
            try {
                if (windowInstance.contents) {
                    if (surfaceOwnership && typeof surfaceOwnership.rememberContentsOwner === 'function') {
                        surfaceOwnership.rememberContentsOwner(windowInstance.contents, windowInstance, {
                            adapterId: 'message',
                            surfaceType: 'message',
                            role: 'message-contents',
                            windowOwned: true,
                            dedicatedTextHook: true,
                            bypassBitmapDrawReason: 'messageContents',
                        });
                    }
                    claimMessageContentsSurface(windowInstance);
                }
            } catch (_) {}
        }

        function rememberDedicatedTextOwner(windowInstance) {
            if (!windowInstance || !surfaceOwnership || typeof surfaceOwnership.rememberDedicatedTextOwner !== 'function') return false;
            try {
                return surfaceOwnership.rememberDedicatedTextOwner(windowInstance, {
                    adapterId: 'message',
                    surfaceType: 'message',
                    role: 'message-window',
                    reason: 'message-adapter',
                }) === true;
            } catch (_) {
                return false;
            }
        }

        function rememberDedicatedTextConstructor(Ctor) {
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

        function isDedicatedTextOwner(windowInstance) {
            if (!windowInstance || !surfaceOwnership || typeof surfaceOwnership.isDedicatedTextOwner !== 'function') return false;
            try {
                return surfaceOwnership.isDedicatedTextOwner(windowInstance) === true;
            } catch (_) {
                return false;
            }
        }

        function claimMessageContentsSurface(windowInstance) {
            if (!windowInstance || !windowInstance.contents) return false;
            if (!adapterContract || typeof adapterContract.claimSurface !== 'function') return false;
            const existingClaim = readMessageContentsClaim(windowInstance);
            if (existingClaim && existingClaim.target === windowInstance.contents) {
                return true;
            }
            if (existingClaim && existingClaim.token && typeof adapterContract.releaseSurface === 'function') {
                adapterContract.releaseSurface(existingClaim.token, 'message-contents-replaced');
            }
            const claim = adapterContract.claimSurface({
                target: windowInstance.contents,
                surfaceId: `message:${getWindowId(windowInstance)}:contents`,
                surfaceType: 'message',
                role: 'message-contents',
                owner: windowInstance,
            });
            if (claim && claim.status === 'claimed' && claim.token) {
                rememberMessageContentsClaim(windowInstance, claim.token, windowInstance.contents);
                return true;
            }
            return false;
        }

        function readMessageContentsClaim(windowInstance) {
            if (!windowInstance || !messageContentsClaims || typeof messageContentsClaims.get !== 'function') return null;
            try {
                return messageContentsClaims.get(windowInstance) || null;
            } catch (_) {
                return null;
            }
        }

        function rememberMessageContentsClaim(windowInstance, token, target) {
            if (!windowInstance || !token || !messageContentsClaims || typeof messageContentsClaims.set !== 'function') return false;
            try {
                messageContentsClaims.set(windowInstance, { token, target });
                return true;
            } catch (_) {
                return false;
            }
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
         * Publish only a intel marker. Cross-adapter ownership now flows
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
            const messageStart = getMessageStartCoordinates(windowInstance);
            if (!hasNumber(startX) && hasNumber(messageStart.x)) startX = messageStart.x;
            if (!hasNumber(startY) && hasNumber(messageStart.y)) startY = messageStart.y;

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

            return { create: createController };
        },
    });
})();
