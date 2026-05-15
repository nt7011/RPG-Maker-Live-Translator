// Game message adapter support: wrapping.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/wrapping.js.');
    }

    function createController(scope = {}) {
        const { ESCAPE_CODE_PATTERN, NUMERIC_PARAM_PATTERN, CJK_CHAR_PATTERN, captureBitmapDrawState, applyBitmapDrawState } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { resolveMessageStartCoordinates } = Object.fromEntries(['resolveMessageStartCoordinates'].map((name) => [name, callScope(name)]));

        /**
         * Create a scoped text-scale override for translated message rendering.
         */
        function createTextScaleScope(windowInstance, scalePercent) {
            if (!windowInstance || !windowInstance.contents) return null;
            if (!Number.isInteger(scalePercent) || scalePercent <= 0 || scalePercent >= 100) return null;

            const scaleFactor = scalePercent / 100;
            const wrappedMethods = [];
            const originalStates = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
            let trackedContents = null;
            let logicalFontSize = null;

            /**
             * Remember the original bitmap draw state for one contents bitmap.
             */
            function rememberOriginalState(contents) {
                if (!contents || !originalStates || originalStates.has(contents)) return;
                originalStates.set(contents, captureBitmapDrawState(contents));
            }

            /**
             * Track contents replacement so scale and state restore follow createContents.
             */
            function syncTrackedContents(contents) {
                if (!contents) {
                    trackedContents = null;
                    try { windowInstance._trGameMessageTextScaleContents = null; } catch (_) {}
                    return null;
                }
                if (contents !== trackedContents) {
                    trackedContents = contents;
                    rememberOriginalState(contents);
                    try { windowInstance._trGameMessageTextScaleContents = contents; } catch (_) {}
                    if (!Number.isFinite(logicalFontSize) || logicalFontSize <= 0) {
                        const initialFontSize = Number(contents.fontSize);
                        if (Number.isFinite(initialFontSize) && initialFontSize > 0) logicalFontSize = initialFontSize;
                    }
                }
                return contents;
            }

            /**
             * Return the currently attached contents bitmap and sync state.
             */
            function getTrackedContents() {
                const current = windowInstance ? windowInstance.contents : null;
                return syncTrackedContents(current);
            }

            /**
             * Capture the unscaled logical font size before applying scale.
             */
            function refreshLogicalFontSize(contents = getTrackedContents()) {
                const activeContents = syncTrackedContents(contents);
                const current = activeContents ? Number(activeContents.fontSize) : NaN;
                if (Number.isFinite(current) && current > 0) logicalFontSize = current;
            }

            /**
             * Apply the configured scale to the tracked contents bitmap.
             */
            function applyScaledFontSize(contents = getTrackedContents()) {
                const activeContents = syncTrackedContents(contents);
                if (!activeContents || !Number.isFinite(logicalFontSize) || logicalFontSize <= 0) return;
                activeContents.fontSize = Math.max(1, Math.round(logicalFontSize * scaleFactor));
            }

            /**
             * Wrap one mutable font method and remember how to restore it.
             */
            function wrapMethod(name, factory) {
                const original = windowInstance[name];
                if (typeof original !== 'function') return;
                wrappedMethods.push({
                    name,
                    original,
                    hadOwnProperty: Object.prototype.hasOwnProperty.call(windowInstance, name),
                });
                windowInstance[name] = factory(original);
            }

            /**
             * Run font-size mutation methods against the logical size, then rescale.
             */
            function invokeWithLogicalFontSize(original, owner, args) {
                const contents = syncTrackedContents(owner && owner.contents ? owner.contents : getTrackedContents());
                if (contents && Number.isFinite(logicalFontSize) && logicalFontSize > 0) contents.fontSize = logicalFontSize;
                const result = original.apply(owner, args);
                const updatedContents = owner && owner.contents ? owner.contents : getTrackedContents();
                refreshLogicalFontSize(updatedContents);
                applyScaledFontSize(updatedContents);
                return result;
            }

            // Keep translated message text scaled after resetFontSettings().
            wrapMethod('resetFontSettings', (original) => function(...args) {
                const result = original.apply(this, args);
                const currentContents = this && this.contents ? this.contents : getTrackedContents();
                refreshLogicalFontSize(currentContents);
                applyScaledFontSize(currentContents);
                return result;
            });
            // Reapply translated message text scale after the contents bitmap is recreated.
            wrapMethod('createContents', (original) => function(...args) {
                const result = original.apply(this, args);
                const currentContents = this && this.contents ? this.contents : getTrackedContents();
                refreshLogicalFontSize(currentContents);
                applyScaledFontSize(currentContents);
                return result;
            });
            // Run makeFontBigger against the unscaled logical font size.
            wrapMethod('makeFontBigger', (original) => function(...args) {
                return invokeWithLogicalFontSize(original, this, args);
            });
            // Run makeFontSmaller against the unscaled logical font size.
            wrapMethod('makeFontSmaller', (original) => function(...args) {
                return invokeWithLogicalFontSize(original, this, args);
            });

            applyScaledFontSize();

            return {
                /**
                 * Restore wrapped methods and bitmap draw state after translated rendering.
                 */
                restore() {
                    for (let i = wrappedMethods.length - 1; i >= 0; i -= 1) {
                        const wrapped = wrappedMethods[i];
                        try {
                            if (wrapped.hadOwnProperty) windowInstance[wrapped.name] = wrapped.original;
                            else delete windowInstance[wrapped.name];
                        } catch (_) {}
                    }
                    const currentContents = windowInstance ? windowInstance.contents : null;
                    if (!currentContents) return;
                    const originalState = originalStates && originalStates.has(currentContents)
                        ? originalStates.get(currentContents)
                        : captureBitmapDrawState(currentContents);
                    if (originalState) {
                        try { applyBitmapDrawState(currentContents, originalState); } catch (_) {}
                    }
                },
            };
        }

        /**
         * Dispose any persistent message text-scale scope on a window.
         */
        function disposeTextScaleScope(windowInstance) {
            if (!windowInstance || !windowInstance._trGameMessageTextScaleScope) return;
            try { windowInstance._trGameMessageTextScaleScope.restore(); } catch (_) {}
            windowInstance._trGameMessageTextScaleScope = null;
            windowInstance._trGameMessageTextScaleContents = null;
        }

        /**
         * Ensure the persistent message text-scale scope exists when scaling is enabled.
         */
        function ensureTextScaleScope(windowInstance) {
            if (!windowInstance || !windowInstance.contents) return null;
            if (!Number.isInteger(scope.textScalePercent) || scope.textScalePercent <= 0 || scope.textScalePercent >= 100) {
                disposeTextScaleScope(windowInstance);
                return null;
            }
            if (windowInstance._trGameMessageTextScaleScope) {
                windowInstance._trGameMessageTextScaleContents = windowInstance.contents;
                return windowInstance._trGameMessageTextScaleScope;
            }
            disposeTextScaleScope(windowInstance);
            const scaleScope = createTextScaleScope(windowInstance, scope.textScalePercent);
            if (scaleScope) {
                windowInstance._trGameMessageTextScaleScope = scaleScope;
                windowInstance._trGameMessageTextScaleContents = windowInstance.contents;
            }
            return scaleScope;
        }

        /**
         * Read the current message line height using engine APIs when possible.
         */
        function getCurrentLineHeight(windowInstance) {
            if (!windowInstance || !windowInstance.contents) return 32;
            try {
                if (typeof windowInstance.lineHeight === 'function') {
                    const nativeLineHeight = Number(windowInstance.lineHeight());
                    if (Number.isFinite(nativeLineHeight) && nativeLineHeight > 0) return Math.max(1, Math.ceil(nativeLineHeight));
                }
            } catch (_) {}
            const fontSize = Number(windowInstance.contents.fontSize);
            return Number.isFinite(fontSize) && fontSize > 0 ? fontSize + 8 : 32;
        }

        /**
         * Avoid plugin-added soft wraps when a message window can only show one line.
         */
        function canSoftWrap(contentsHeight, lineHeight) {
            const height = Number(contentsHeight);
            const line = Number(lineHeight);
            if (!Number.isFinite(height) || height <= 0 || height === Number.MAX_SAFE_INTEGER) return true;
            if (!Number.isFinite(line) || line <= 0) return true;
            return height >= line * 2;
        }

        /**
         * Reset wrap measurements after a message page break.
         */
        function resetWrapPageState(windowInstance, wrapState) {
            if (typeof windowInstance.resetFontSettings === 'function') windowInstance.resetFontSettings();
            wrapState.currentX = wrapState.startX;
            wrapState.currentY = 0;
            wrapState.hasContentOnLine = false;
            wrapState.trimLeadingWhitespace = false;
            wrapState.lineHeight = getCurrentLineHeight(windowInstance);
        }

        /**
         * Commit one wrapped line and move measurement to the next line or page.
         */
        function commitWrapLineBreak(windowInstance, wrapState, inserted) {
            wrapState.currentX = wrapState.startX;
            wrapState.currentY += wrapState.lineHeight;
            wrapState.hasContentOnLine = false;
            wrapState.trimLeadingWhitespace = !!inserted;
            wrapState.lineHeight = getCurrentLineHeight(windowInstance);
            if (wrapState.contentsHeight > 0
                && wrapState.currentY + wrapState.lineHeight > wrapState.contentsHeight) {
                resetWrapPageState(windowInstance, wrapState);
            }
        }

        /**
         * Read an RPG Maker escape token so wrapping can account for icons/font changes.
         */
        function readEscapeToken(text, index) {
            if (text.charAt(index) !== '\x1b') return null;
            let cursor = index + 1;
            let raw = '\x1b';
            let code = '';
            const codeMatch = ESCAPE_CODE_PATTERN.exec(text.slice(cursor));
            if (codeMatch && codeMatch[0]) {
                code = String(codeMatch[0] || '');
                cursor += code.length;
                raw += code;
            }
            let param = null;
            const paramMatch = NUMERIC_PARAM_PATTERN.exec(text.slice(cursor));
            if (paramMatch && paramMatch[0]) {
                raw += paramMatch[0];
                cursor += paramMatch[0].length;
                param = parseInt(paramMatch[0].slice(1, -1), 10);
            }
            return { type: 'escape', raw, code: code.toUpperCase(), param, nextIndex: cursor };
        }

        /**
         * Identify horizontal whitespace consumed by soft wrap trimming.
         */
        function isMessageWhitespace(character) {
            return character === ' ' || character === '\t';
        }

        /**
         * Identify characters that can wrap one glyph at a time.
         */
        function isMessageCjkCharacter(character) {
            return CJK_CHAR_PATTERN.test(character);
        }

        /**
         * Convert message text into wrapable units while preserving control codes.
         */
        function tokenizeMessageText(text) {
            const tokens = [];
            const source = String(text || '');
            let index = 0;
            while (index < source.length) {
                const character = source.charAt(index);
                if (character === '\n') {
                    tokens.push({ type: 'newline', raw: '\n' });
                    index += 1;
                    continue;
                }
                if (character === '\f') {
                    tokens.push({ type: 'newpage', raw: '\f' });
                    index += 1;
                    continue;
                }
                if (character === '\x1b') {
                    const escapeToken = readEscapeToken(source, index);
                    if (escapeToken) {
                        tokens.push(escapeToken);
                        index = escapeToken.nextIndex;
                        continue;
                    }
                }
                if (isMessageWhitespace(character)) {
                    let end = index + 1;
                    while (end < source.length && isMessageWhitespace(source.charAt(end))) end += 1;
                    tokens.push({ type: 'space', raw: source.slice(index, end) });
                    index = end;
                    continue;
                }
                if (isMessageCjkCharacter(character)) {
                    tokens.push({ type: 'text', raw: character, forceCharWrap: true });
                    index += 1;
                    continue;
                }
                let end = index + 1;
                while (end < source.length) {
                    const nextChar = source.charAt(end);
                    if (nextChar === '\n'
                        || nextChar === '\f'
                        || nextChar === '\x1b'
                        || isMessageWhitespace(nextChar)
                        || isMessageCjkCharacter(nextChar)) {
                        break;
                    }
                    end += 1;
                }
                tokens.push({ type: 'text', raw: source.slice(index, end), forceCharWrap: false });
                index = end;
            }
            return tokens;
        }

        /**
         * Measure one token with Window_Message APIs and safe fallbacks.
         */
        function measureTokenWidth(windowInstance, token) {
            if (!windowInstance || !windowInstance.contents || !token) return 0;
            if (token.type === 'escape') {
                if (token.code === 'I') {
                    const iconWidth = typeof Window_Base !== 'undefined' && Number.isFinite(Window_Base._iconWidth)
                        ? Window_Base._iconWidth
                        : 32;
                    return iconWidth + 4;
                }
                return 0;
            }
            if (token.type !== 'space' && token.type !== 'text') return 0;
            const raw = String(token.raw || '');
            if (!raw) return 0;
            try {
                if (typeof windowInstance.textWidth === 'function') return Math.max(0, Math.ceil(windowInstance.textWidth(raw)));
                if (windowInstance.contents && typeof windowInstance.contents.measureTextWidth === 'function') {
                    return Math.max(0, Math.ceil(windowInstance.contents.measureTextWidth(raw)));
                }
            } catch (_) {}
            return raw.length * Math.max(1, Math.round(getCurrentLineHeight(windowInstance) / 2));
        }

        /**
         * Apply escape-token layout effects to the wrapping cursor.
         */
        function applyEscapeToken(windowInstance, wrapState, token) {
            if (!windowInstance || !token || token.type !== 'escape') return;
            switch (token.code) {
            case '{':
                if (typeof windowInstance.makeFontBigger === 'function') windowInstance.makeFontBigger();
                wrapState.lineHeight = Math.max(wrapState.lineHeight, getCurrentLineHeight(windowInstance));
                break;
            case '}':
                if (typeof windowInstance.makeFontSmaller === 'function') windowInstance.makeFontSmaller();
                wrapState.lineHeight = Math.max(wrapState.lineHeight, getCurrentLineHeight(windowInstance));
                break;
            case 'I':
                wrapState.currentX += measureTokenWidth(windowInstance, token);
                wrapState.hasContentOnLine = true;
                break;
            default:
                break;
            }
        }

        /**
         * Append a measured text run to wrapped output.
         */
        function appendMeasuredText(windowInstance, wrapState, output, raw) {
            wrapState.lineHeight = Math.max(wrapState.lineHeight, getCurrentLineHeight(windowInstance));
            wrapState.currentX += measureTokenWidth(windowInstance, { type: 'text', raw });
            wrapState.hasContentOnLine = true;
            wrapState.trimLeadingWhitespace = false;
            output.push(raw);
        }

        /**
         * Append text and insert soft wraps only when the window has room for them.
         */
        function appendTextRun(windowInstance, wrapState, output, raw) {
            const text = String(raw || '');
            if (!text) return;
            if (!wrapState.allowSoftWrapLineBreaks) {
                appendMeasuredText(windowInstance, wrapState, output, text);
                return;
            }

            const tokenWidth = measureTokenWidth(windowInstance, { type: 'text', raw: text });
            if (wrapState.currentX + tokenWidth <= wrapState.contentsWidth) {
                appendMeasuredText(windowInstance, wrapState, output, text);
                return;
            }

            if (wrapState.hasContentOnLine) {
                output.push('\n');
                commitWrapLineBreak(windowInstance, wrapState, true);
            }

            const fullWidth = measureTokenWidth(windowInstance, { type: 'text', raw: text });
            if (fullWidth <= wrapState.contentsWidth || text.length <= 1) {
                appendMeasuredText(windowInstance, wrapState, output, text);
                return;
            }

            for (const character of Array.from(text)) {
                const charWidth = measureTokenWidth(windowInstance, { type: 'text', raw: character });
                if (wrapState.hasContentOnLine && wrapState.currentX + charWidth > wrapState.contentsWidth) {
                    output.push('\n');
                    commitWrapLineBreak(windowInstance, wrapState, true);
                }
                appendMeasuredText(windowInstance, wrapState, output, character);
            }
        }

        /**
         * Produce translated message text wrapped for the current message window.
         */
        function wrapMessageText(windowInstance, text) {
            if (!windowInstance || !windowInstance.contents) return String(text || '');
            const source = String(text || '');
            if (!source) return source;

            ensureTextScaleScope(windowInstance);
            if (typeof windowInstance.resetFontSettings === 'function') windowInstance.resetFontSettings();

            const startX = resolveMessageStartX(windowInstance);
            const contentsWidth = Number.isFinite(Number(windowInstance.contents.width))
                ? Math.max(startX + 1, Number(windowInstance.contents.width))
                : Number.MAX_SAFE_INTEGER;
            const contentsHeight = Number.isFinite(Number(windowInstance.contents.height))
                ? Math.max(1, Number(windowInstance.contents.height))
                : Number.MAX_SAFE_INTEGER;
            const wrapState = {
                startX,
                currentX: startX,
                currentY: 0,
                contentsWidth,
                contentsHeight,
                lineHeight: getCurrentLineHeight(windowInstance),
                hasContentOnLine: false,
                trimLeadingWhitespace: false,
                allowSoftWrapLineBreaks: canSoftWrap(contentsHeight, getCurrentLineHeight(windowInstance)),
            };
            const output = [];

            for (const token of tokenizeMessageText(source)) {
                if (token.type === 'newline') {
                    output.push(token.raw);
                    commitWrapLineBreak(windowInstance, wrapState, false);
                } else if (token.type === 'newpage') {
                    output.push(token.raw);
                    resetWrapPageState(windowInstance, wrapState);
                } else if (token.type === 'escape') {
                    appendEscapeTokenForWrap(windowInstance, wrapState, output, token);
                } else if (token.type === 'space') {
                    appendSpaceTokenForWrap(windowInstance, wrapState, output, token);
                } else {
                    appendTextRun(windowInstance, wrapState, output, token.raw);
                }
            }

            if (typeof windowInstance.resetFontSettings === 'function') windowInstance.resetFontSettings();
            return output.join('');
        }

        /**
         * Resolve the x coordinate where message text begins.
         */
        function resolveMessageStartX(windowInstance) {
            try {
                if (typeof windowInstance.newLineX === 'function') {
                    const value = Number(windowInstance.newLineX());
                    if (Number.isFinite(value)) return Math.max(0, value);
                }
            } catch (_) {}
            const fallback = resolveMessageStartCoordinates(windowInstance);
            return Number.isFinite(fallback.x) ? Math.max(0, fallback.x) : 0;
        }

        /**
         * Append an escape token and insert a soft wrap before icons when needed.
         */
        function appendEscapeTokenForWrap(windowInstance, wrapState, output, token) {
            if (token.code === 'I') {
                const iconWidth = measureTokenWidth(windowInstance, token);
                if (wrapState.allowSoftWrapLineBreaks
                    && wrapState.hasContentOnLine
                    && wrapState.currentX + iconWidth > wrapState.contentsWidth) {
                    output.push('\n');
                    commitWrapLineBreak(windowInstance, wrapState, true);
                }
            }
            output.push(token.raw);
            applyEscapeToken(windowInstance, wrapState, token);
        }

        /**
         * Append whitespace while trimming spaces at inserted wrap boundaries.
         */
        function appendSpaceTokenForWrap(windowInstance, wrapState, output, token) {
            if (wrapState.trimLeadingWhitespace) return;
            const spaceWidth = measureTokenWidth(windowInstance, token);
            if (wrapState.allowSoftWrapLineBreaks
                && wrapState.hasContentOnLine
                && wrapState.currentX + spaceWidth > wrapState.contentsWidth) {
                output.push('\n');
                commitWrapLineBreak(windowInstance, wrapState, true);
                return;
            }
            wrapState.currentX += spaceWidth;
            wrapState.hasContentOnLine = wrapState.hasContentOnLine || token.raw.length > 0;
            output.push(token.raw);
        }

        return {
            createTextScaleScope,
            disposeTextScaleScope,
            ensureTextScaleScope,
            getCurrentLineHeight,
            canSoftWrap,
            resetWrapPageState,
            commitWrapLineBreak,
            readEscapeToken,
            isMessageWhitespace,
            isMessageCjkCharacter,
            tokenizeMessageText,
            measureTokenWidth,
            applyEscapeToken,
            appendMeasuredText,
            appendTextRun,
            wrapMessageText,
            resolveMessageStartX,
            appendEscapeTokenForWrap,
            appendSpaceTokenForWrap,
        };
    }

    defineRuntimeModule('adapters.gameMessage.wrapping', { create: createController });
})();
