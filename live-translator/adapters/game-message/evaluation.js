// Game message adapter support: evaluation.
// Owns disposable Game_Message/Window_Message branches used for escape conversion.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.gameMessage.evaluation',
        requires: {
            conversionBranch: 'runtime.conversionBranch',
            conversionScope: 'runtime.conversionScope',
        },
        factory({ conversionBranch, conversionScope }) {

    function createController(scope = {}) {
        const { globalScope } = scope;
        const { getGameMessageForWindow } = scope.controllerFacades.install;
        const { warn } = scope.controllerFacades.render;

        /**
         * Run Window_Message escape conversion against disposable message state.
         */
        function evaluateGameMessageText(windowInstance, rawText, options = {}) {
            const sourceText = String(rawText || '');
            if (!windowInstance || typeof windowInstance.convertEscapeCharacters !== 'function') {
                return {
                    ok: true,
                    text: sourceText,
                    rawText: sourceText,
                    converted: false,
                    reason: 'converter-unavailable',
                };
            }

            const liveGameMessage = options.gameMessage || getGameMessageForWindow(windowInstance) || getGlobalGameMessage();
            const liveGlobalGameMessage = getGlobalGameMessage();
            const conversionTransaction = conversionScope.createTransaction({
                reason: 'message-evaluation',
                rootWindow: windowInstance,
                gameMessage: liveGameMessage,
            });
            const messageBranch = createEvaluationGameMessage(liveGameMessage, sourceText);
            registerEvaluationGameMessage(conversionTransaction, liveGameMessage, messageBranch);
            if (liveGlobalGameMessage && liveGlobalGameMessage !== liveGameMessage) {
                registerEvaluationGameMessage(conversionTransaction, liveGlobalGameMessage, messageBranch);
            }
            const branchOptions = {
                conversionTransaction,
                gameMessageBranch: messageBranch,
                globalGameMessage: liveGlobalGameMessage,
            };
            const windowBranch = createEvaluationWindow(windowInstance, messageBranch, branchOptions);
            registerEvaluationUiTargets(windowInstance, branchOptions);
            const converter = windowInstance.convertEscapeCharacters;
            try {
                const converted = conversionScope.run(conversionTransaction, () => {
                    return converter.call(windowBranch, sourceText);
                });
                return {
                    ok: true,
                    text: String(converted ?? ''),
                    rawText: sourceText,
                    converted: true,
                    gameMessage: messageBranch,
                    windowInstance: windowBranch,
                };
            } catch (error) {
                warn('[GameMessage] Isolated message evaluation failed.', error);
                return {
                    ok: false,
                    text: sourceText,
                    rawText: sourceText,
                    converted: false,
                    error,
                    reason: error && error.message ? error.message : 'evaluation-failed',
                };
            }
        }

        /**
         * Convert a redraw candidate into text that can be rendered without
         * asking the live message window to convert escapes.
         */
        function prepareMessageRedrawText(windowInstance, rawText, payload = null, options = {}) {
            const sourceText = String(rawText || '');
            if (options.streamingPreview === true) {
                const previewText = createStreamingPreviewText(sourceText);
                return {
                    ok: !!previewText.trim(),
                    text: previewText,
                    rawText: sourceText,
                    preconverted: true,
                    degradedPreview: true,
                    reason: previewText.trim() ? 'streaming-preview' : 'streaming-preview-empty',
                };
            }

            const evaluated = evaluateGameMessageText(windowInstance, sourceText, {
                gameMessage: payload && payload.gameMessage,
            });
            if (!evaluated.ok) {
                return {
                    ok: false,
                    text: '',
                    rawText: sourceText,
                    preconverted: false,
                    degradedPreview: false,
                    reason: evaluated.reason || 'evaluation-failed',
                    error: evaluated.error,
                };
            }
            return {
                ok: true,
                text: evaluated.text,
                rawText: sourceText,
                preconverted: evaluated.converted === true,
                degradedPreview: false,
                reason: 'converted',
            };
        }

        /**
         * Streaming previews are intentionally plain text. They must never run
         * plugin escape commands while partial provider output is still unstable.
         */
        function createStreamingPreviewText(text) {
            return stripMessageControlCodes(String(text || ''))
                .replace(/\r\n|\r/g, '\n')
                .replace(/\f/g, '\n')
                .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
        }

        function stripMessageControlCodes(text) {
            return String(text || '').replace(/(?:\x1b|\\)(?:[A-Za-z0-9_#]+|[^\s\w])(?:\[[^\]\r\n]*(?:\]|$)|<[^>\r\n]*(?:>|$))?/g, '');
        }

        /**
         * Branch only the Game_Message object. Its prototype methods remain
         * available, but data writes land on this disposable object.
         */
        function createEvaluationGameMessage(liveGameMessage, rawText) {
            const branch = conversionBranch.createObjectBranch(liveGameMessage || getPrototypeOnlyGameMessage());
            applyEvaluationMessageText(branch, rawText);
            try { branch._trEvaluationOnly = true; } catch (_) {}
            return branch;
        }

        function getPrototypeOnlyGameMessage() {
            try {
                if (typeof Game_Message !== 'undefined' && Game_Message && Game_Message.prototype) {
                    return Object.create(Game_Message.prototype);
                }
            } catch (_) {}
            return {};
        }

        function applyEvaluationMessageText(gameMessage, rawText) {
            const text = String(rawText || '');
            const lines = text.length ? text.split(/\r\n|\r|\n/g) : [];
            try { gameMessage._texts = lines.slice(); } catch (_) {}
            try { gameMessage.text = text; } catch (_) {}
            try { gameMessage._text = text; } catch (_) {}
        }

        /**
         * Branch the window receiver and replace UI surfaces with inert sinks.
         */
        function createEvaluationWindow(windowInstance, gameMessageBranch, options = {}) {
            return conversionBranch.createWindowBranch(windowInstance, {
                conversionScope,
                conversionTransaction: options.conversionTransaction || null,
                gameMessageBranch,
                globalGameMessage: options.globalGameMessage || getGlobalGameMessage(),
            });
        }

        function registerEvaluationGameMessage(conversionTransaction, liveGameMessage, messageBranch) {
            if (!liveGameMessage || !messageBranch) return false;
            return conversionScope.registerTarget(
                conversionTransaction,
                liveGameMessage,
                messageBranch,
                { role: 'gameMessage' }
            );
        }

        function registerEvaluationUiTargets(windowInstance, options = {}) {
            const seen = typeof WeakSet === 'function' ? new WeakSet() : null;
            collectKnownEvaluationWindows(windowInstance, seen).forEach((targetWindow) => {
                registerEvaluationWindowTarget(targetWindow, options);
            });
        }

        function collectKnownEvaluationWindows(windowInstance, seen) {
            const windows = [];
            const remember = (targetWindow) => {
                if (!targetWindow || typeof targetWindow !== 'object') return;
                if (seen) {
                    try {
                        if (seen.has(targetWindow)) return;
                        seen.add(targetWindow);
                    } catch (_) {}
                }
                windows.push(targetWindow);
                collectSubWindows(targetWindow, remember);
            };
            remember(windowInstance);
            collectKnownWindowFields(windowInstance, remember);
            const scene = getActiveScene();
            collectKnownWindowFields(scene, remember);
            const sceneMessageWindow = scene && scene._messageWindow;
            if (sceneMessageWindow && sceneMessageWindow !== windowInstance) {
                remember(sceneMessageWindow);
                collectKnownWindowFields(sceneMessageWindow, remember);
            }
            return windows;
        }

        function collectKnownWindowFields(owner, remember) {
            if (!owner || typeof remember !== 'function') return;
            [
                '_messageWindow',
                '_nameWindow',
                '_nameBoxWindow',
                '_choiceWindow',
                '_numberWindow',
                '_itemWindow',
                '_goldWindow',
            ].forEach((key) => {
                try { remember(owner[key]); } catch (_) {}
            });
        }

        function collectSubWindows(windowInstance, remember) {
            if (!windowInstance || typeof windowInstance.subWindows !== 'function' || typeof remember !== 'function') return;
            try {
                const subWindows = windowInstance.subWindows();
                if (!Array.isArray(subWindows)) return;
                subWindows.forEach((subWindow) => remember(subWindow));
            } catch (_) {}
        }

        function registerEvaluationWindowTarget(targetWindow, options = {}) {
            if (!targetWindow || typeof targetWindow !== 'object') return null;
            return conversionBranch.createWindowSink(targetWindow, new WeakMap(), {
                conversionScope,
                conversionTransaction: options.conversionTransaction || null,
                gameMessageBranch: options.gameMessageBranch || null,
                globalGameMessage: options.globalGameMessage || getGlobalGameMessage(),
            });
        }

        function getActiveScene() {
            try {
                return globalScope.SceneManager && globalScope.SceneManager._scene || null;
            } catch (_) {
                return null;
            }
        }

        function getGlobalGameMessage() {
            return globalScope.$gameMessage || null;
        }

        return {
            evaluateGameMessageText,
            prepareMessageRedrawText,
            createStreamingPreviewText,
            stripMessageControlCodes,
            createEvaluationGameMessage,
            createEvaluationWindow,
        };
    }

            return { create: createController };
        },
    });
})();
