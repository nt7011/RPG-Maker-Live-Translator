// Game message adapter support: evaluation.
// Owns disposable Game_Message/Window_Message branches used for escape conversion.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/evaluation.js.');
    }

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
            const messageBranch = createEvaluationGameMessage(liveGameMessage, sourceText);
            const windowBranch = createEvaluationWindow(windowInstance, messageBranch);
            const converter = windowInstance.convertEscapeCharacters;
            try {
                const converted = withEvaluationGameMessage(messageBranch, () => {
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
            const branch = createObjectBranch(liveGameMessage || getPrototypeOnlyGameMessage());
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
        function createEvaluationWindow(windowInstance, gameMessageBranch) {
            const seen = new WeakMap();
            const branch = Object.create(windowInstance);
            seen.set(windowInstance, branch);
            copyBranchProperties(windowInstance, branch, seen, {
                gameMessageBranch,
                uiSinks: true,
            });
            try { branch._gameMessage = gameMessageBranch; } catch (_) {}
            try { branch._trEvaluationOnly = true; } catch (_) {}

            if (typeof windowInstance.subWindows === 'function') {
                const subWindowSinks = new WeakMap();
                branch.subWindows = function() {
                    try {
                        const subWindows = windowInstance.subWindows.call(windowInstance);
                        if (!Array.isArray(subWindows)) return subWindows;
                        return subWindows.map((subWindow) => {
                            if (!isObjectLike(subWindow)) return subWindow;
                            if (!subWindowSinks.has(subWindow)) {
                                subWindowSinks.set(subWindow, createWindowSink(subWindow, seen));
                            }
                            return subWindowSinks.get(subWindow);
                        });
                    } catch (_) {
                        return [];
                    }
                };
            }
            return branch;
        }

        function withEvaluationGameMessage(gameMessageBranch, callback) {
            const hadGlobal = Object.prototype.hasOwnProperty.call(globalScope, '$gameMessage');
            const previous = globalScope.$gameMessage;
            globalScope.$gameMessage = gameMessageBranch;
            if (globalScope.$gameMessage !== gameMessageBranch) {
                throw new Error('Unable to bind evaluation Game_Message.');
            }
            try {
                return callback();
            } finally {
                try {
                    if (hadGlobal) globalScope.$gameMessage = previous;
                    else delete globalScope.$gameMessage;
                } catch (_) {
                    try { globalScope.$gameMessage = previous; } catch (restoreError) {
                        warn('[GameMessage] Failed to restore global $gameMessage after evaluation.', restoreError);
                    }
                }
            }
        }

        function createObjectBranch(source) {
            if (!isObjectLike(source)) return {};
            const prototype = typeof Object.getPrototypeOf === 'function'
                ? Object.getPrototypeOf(source)
                : null;
            const branch = Object.create(prototype || null);
            copyBranchProperties(source, branch, new WeakMap(), {
                uiSinks: false,
            });
            return branch;
        }

        function copyBranchProperties(source, target, seen, options = {}) {
            if (!isObjectLike(source) || !isObjectLike(target)) return target;
            getOwnKeys(source).forEach((key) => {
                try {
                    const descriptor = Object.getOwnPropertyDescriptor(source, key);
                    if (!descriptor) return;
                    const cloned = Object.assign({}, descriptor);
                    if (Object.prototype.hasOwnProperty.call(cloned, 'value')) {
                        cloned.value = createBranchValue(key, cloned.value, seen, options);
                    }
                    Object.defineProperty(target, key, cloned);
                } catch (_) {
                    try { target[key] = createBranchValue(key, source[key], seen, options); } catch (_) {}
                }
            });
            return target;
        }

        function createBranchValue(key, value, seen, options = {}) {
            if (!isObjectLike(value)) return value;
            if (options.gameMessageBranch && isLikelyGameMessageKey(key, value)) {
                return options.gameMessageBranch;
            }
            if (options.uiSinks === true && isWindowLikeValue(value)) {
                return createWindowSink(value, seen);
            }
            if (options.uiSinks === true && isBitmapLikeValue(value)) {
                return createBitmapSink(value, seen);
            }
            if (Array.isArray(value)) {
                return value.map((entry) => createBranchValue('', entry, seen, options));
            }
            if (isPlainObject(value)) {
                return clonePlainObject(value, seen, options);
            }
            return value;
        }

        function clonePlainObject(value, seen, options) {
            if (!isObjectLike(value)) return value;
            if (seen.has(value)) return seen.get(value);
            const clone = Object.create(Object.getPrototypeOf(value) || null);
            seen.set(value, clone);
            copyBranchProperties(value, clone, seen, options);
            return clone;
        }

        function createWindowSink(windowLike, seen = new WeakMap()) {
            if (!isObjectLike(windowLike)) return windowLike;
            if (seen.has(windowLike)) return seen.get(windowLike);
            const sink = Object.create(windowLike);
            seen.set(windowLike, sink);
            copyBranchProperties(windowLike, sink, seen, { uiSinks: true });
            sink.contents = createBitmapSink(windowLike.contents, seen);
            sink.setText = function(text) {
                this._text = String(text || '');
                this.text = this._text;
                return this;
            };
            sink.refresh = function() { return undefined; };
            sink.drawText = function() { return 0; };
            sink.drawTextEx = function() { return 0; };
            sink.drawTextEx2 = function() { return 0; };
            sink.createContents = function() {
                if (!this.contents) this.contents = createBitmapSink(windowLike.contents, seen);
                return this.contents;
            };
            sink.show = function() {
                this.visible = true;
                return this;
            };
            sink.hide = function() {
                this.visible = false;
                return this;
            };
            sink.open = function() {
                this.openness = 255;
                this._openness = 255;
                return this;
            };
            sink.close = function() {
                this.openness = 0;
                this._openness = 0;
                return this;
            };
            sink.activate = function() {
                this.active = true;
                return this;
            };
            sink.deactivate = function() {
                this.active = false;
                return this;
            };
            sink.update = function() { return undefined; };
            sink.setBackgroundType = function(value) {
                this._background = value;
                return this;
            };
            return sink;
        }

        function createBitmapSink(bitmapLike, seen = new WeakMap()) {
            if (!isObjectLike(bitmapLike)) {
                return {
                    clear() {},
                    clearRect() {},
                    drawText() { return 0; },
                    blt() {},
                    measureTextWidth(value) { return String(value || '').length; },
                };
            }
            if (seen.has(bitmapLike)) return seen.get(bitmapLike);
            const sink = Object.create(bitmapLike);
            seen.set(bitmapLike, sink);
            copyBranchProperties(bitmapLike, sink, seen, { uiSinks: false });
            sink.clear = function() { return undefined; };
            sink.clearRect = function() { return undefined; };
            sink.drawText = function() { return 0; };
            sink.blt = function() { return undefined; };
            sink.measureTextWidth = typeof bitmapLike.measureTextWidth === 'function'
                ? function(value) {
                    try { return bitmapLike.measureTextWidth.call(bitmapLike, value); } catch (_) { return String(value || '').length; }
                }
                : function(value) { return String(value || '').length; };
            return sink;
        }

        function getGlobalGameMessage() {
            return globalScope.$gameMessage || null;
        }

        function isLikelyGameMessageKey(key, value) {
            if (key === '_gameMessage' || key === 'gameMessage') return true;
            return !!(value && value === getGlobalGameMessage());
        }

        function getOwnKeys(value) {
            const keys = Object.getOwnPropertyNames(value);
            if (typeof Object.getOwnPropertySymbols === 'function') {
                return keys.concat(Object.getOwnPropertySymbols(value));
            }
            return keys;
        }

        function isObjectLike(value) {
            return !!value && (typeof value === 'object' || typeof value === 'function');
        }

        function isPlainObject(value) {
            if (!value || typeof value !== 'object') return false;
            const prototype = Object.getPrototypeOf(value);
            return prototype === Object.prototype || prototype === null;
        }

        function isWindowLikeValue(value) {
            return isObjectLike(value)
                && (typeof value.open === 'function'
                    || typeof value.close === 'function'
                    || typeof value.activate === 'function'
                    || typeof value.deactivate === 'function'
                    || typeof value.drawText === 'function'
                    || typeof value.drawTextEx === 'function');
        }

        function isBitmapLikeValue(value) {
            return isObjectLike(value)
                && (typeof value.clear === 'function'
                    || typeof value.clearRect === 'function'
                    || typeof value.blt === 'function'
                    || typeof value.measureTextWidth === 'function');
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

    defineRuntimeModule('adapters.gameMessage.evaluation', { create: createController });
})();
