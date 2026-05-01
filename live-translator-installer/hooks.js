(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }

    globalScope.LiveTranslatorModules.createTextHookInstallers = function createTextHookInstallers(options = {}) {
        const {
            logger,
            dbg,
            diag,
            preview,
            stripRpgmEscapes,
            prepareTextForTranslation,
            restoreControlCodes,
            telemetry,
            translationCache,
            settings,
            captureBitmapDrawState,
            applyBitmapDrawState,
            generateKey,
            contentsOwners,
            windowRegistry,
            registeredWindows,
            PER_CHAR_MARK,
            REDRAW_SIGNATURE,
        } = options;

        const logEscape = (level, message, details) => {
            try {
                const logFn = logger && typeof logger[level] === 'function'
                    ? logger[level]
                    : (level === 'trace' && logger && typeof logger.debug === 'function' ? logger.debug : null);
                if (!logFn) return;
                if (details) {
                    logFn(`[EscapeCodes] ${message}`, details);
                } else {
                    logFn(`[EscapeCodes] ${message}`);
                }
            } catch (_) {
                // swallow logging errors
            }
        };

        if (typeof stripRpgmEscapes !== 'function'
            || typeof prepareTextForTranslation !== 'function'
            || typeof restoreControlCodes !== 'function') {
            throw new Error('[TextHooks] control code helpers are required (strip/prepare/restore).');
        }

    function getGameMessageForWindow(windowInstance) {
        try {
            if (windowInstance
                && windowInstance._gameMessage
                && typeof windowInstance._gameMessage.allText === 'function') {
                return windowInstance._gameMessage;
            }
        } catch (_) {}
        try {
            if (typeof $gameMessage !== 'undefined'
                && $gameMessage
                && typeof $gameMessage.allText === 'function') {
                return $gameMessage;
            }
        } catch (_) {}
        return null;
    }

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
            }
        } catch (_) {}
    }

    function drawMessageFaceIfNeeded(windowInstance) {
        try {
            if (!windowInstance) return;
            const gameMessage = getGameMessageForWindow(windowInstance);
            if (typeof windowInstance.drawMessageFace === 'function'
                && gameMessage
                && typeof gameMessage.faceName === 'function'
                && gameMessage.faceName()) {
                windowInstance.drawMessageFace();
            }
        } catch (_) {}
    }

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
                if (!hasNumber(startX)) {
                    if (hasNumber(state.startX)) startX = state.startX;
                    else if (hasNumber(state.x)) startX = state.x;
                }
                if (!hasNumber(startY) && hasNumber(state.y)) {
                    startY = state.y;
                }
            }
            if (!hasNumber(startX)) {
                if (typeof windowInstance.newLineX === 'function') {
                    startX = windowInstance.newLineX(state || undefined);
                } else if (typeof windowInstance.textPadding === 'function') {
                    startX = windowInstance.textPadding();
                }
            }
        } catch (error) {
            logger.warn('[GameMessage] Failed to determine start coordinates; using fallback.', error);
            if (!hasNumber(startX) && typeof windowInstance.textPadding === 'function') {
                startX = windowInstance.textPadding();
            }
            if (!hasNumber(startY)) startY = 0;
        }
        if (!hasNumber(startX)) startX = 0;
        if (!hasNumber(startY)) startY = 0;
        return { x: startX, y: startY };
    }

    const GAME_MESSAGE_ESCAPE_CODE_PATTERN = /^[\$\.\|\^!><\{\}\\]|^[A-Z]+/i;
    const GAME_MESSAGE_NUMERIC_PARAM_PATTERN = /^\[\d+\]/;
    const GAME_MESSAGE_CJK_CHAR_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

    const isAbortErrorLike = (error) => {
        if (!error) return false;
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return true;
        const message = typeof error.message === 'string' ? error.message : String(error);
        return /\bAbortError\b/i.test(message) || /\baborted\b/i.test(message);
    };

    function resolveGameMessageTextScale(config) {
        const fallback = 100;
        if (!config || typeof config !== 'object') return fallback;
        const gameMessage = config.gameMessage;
        if (!gameMessage || typeof gameMessage !== 'object') return fallback;

        const raw = gameMessage.textScale;

        const numeric = Number(raw);
        if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
            return fallback;
        }
        return numeric;
    }

    const gameMessageTextScale = resolveGameMessageTextScale(settings);

    function createGameMessageTextScaleScope(windowInstance, scalePercent) {
        if (!windowInstance || !windowInstance.contents) return null;
        if (!Number.isInteger(scalePercent) || scalePercent <= 0 || scalePercent >= 100) return null;

        const scaleFactor = scalePercent / 100;
        const wrappedMethods = [];
        const originalStates = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
        let trackedContents = null;
        let logicalFontSize = null;

        const rememberOriginalState = (contents) => {
            if (!contents || !originalStates || originalStates.has(contents)) return;
            originalStates.set(contents, captureBitmapDrawState(contents));
        };

        const syncTrackedContents = (contents) => {
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
                    if (Number.isFinite(initialFontSize) && initialFontSize > 0) {
                        logicalFontSize = initialFontSize;
                    }
                }
            }
            return contents;
        };

        const getTrackedContents = () => {
            const current = windowInstance ? windowInstance.contents : null;
            if (!current) {
                return syncTrackedContents(null);
            }
            if (current !== trackedContents) {
                return syncTrackedContents(current);
            }
            return current;
        };

        const refreshLogicalFontSize = (contents = getTrackedContents()) => {
            const activeContents = syncTrackedContents(contents);
            const current = activeContents ? Number(activeContents.fontSize) : NaN;
            if (Number.isFinite(current) && current > 0) {
                logicalFontSize = current;
            }
        };

        const applyScaledFontSize = (contents = getTrackedContents()) => {
            const activeContents = syncTrackedContents(contents);
            if (!activeContents || !Number.isFinite(logicalFontSize) || logicalFontSize <= 0) return;
            activeContents.fontSize = Math.max(1, Math.round(logicalFontSize * scaleFactor));
        };

        const wrapMethod = (name, factory) => {
            const original = windowInstance[name];
            if (typeof original !== 'function') return;
            wrappedMethods.push({
                name,
                original,
                hadOwnProperty: Object.prototype.hasOwnProperty.call(windowInstance, name),
            });
            windowInstance[name] = factory(original);
        };

        const invokeWithLogicalFontSize = (original, context, args) => {
            const contents = syncTrackedContents((context && context.contents) ? context.contents : getTrackedContents());
            if (contents && Number.isFinite(logicalFontSize) && logicalFontSize > 0) {
                contents.fontSize = logicalFontSize;
            }
            const result = original.apply(context, args);
            const updatedContents = (context && context.contents) ? context.contents : getTrackedContents();
            refreshLogicalFontSize(updatedContents);
            applyScaledFontSize(updatedContents);
            return result;
        };

        wrapMethod('resetFontSettings', (original) => function(...args) {
            const result = original.apply(this, args);
            const currentContents = (this && this.contents) ? this.contents : getTrackedContents();
            refreshLogicalFontSize(currentContents);
            applyScaledFontSize(currentContents);
            return result;
        });

        wrapMethod('createContents', (original) => function(...args) {
            const result = original.apply(this, args);
            const currentContents = (this && this.contents) ? this.contents : getTrackedContents();
            refreshLogicalFontSize(currentContents);
            applyScaledFontSize(currentContents);
            return result;
        });

        wrapMethod('makeFontBigger', (original) => function(...args) {
            return invokeWithLogicalFontSize(original, this, args);
        });

        wrapMethod('makeFontSmaller', (original) => function(...args) {
            return invokeWithLogicalFontSize(original, this, args);
        });

        applyScaledFontSize();

        return {
            restore() {
                for (let i = wrappedMethods.length - 1; i >= 0; i -= 1) {
                    const wrapped = wrappedMethods[i];
                    try {
                        if (wrapped.hadOwnProperty) {
                            windowInstance[wrapped.name] = wrapped.original;
                        } else {
                            delete windowInstance[wrapped.name];
                        }
                    } catch (_) {}
                }
                const currentContents = windowInstance ? windowInstance.contents : null;
                if (currentContents) {
                    const originalState = originalStates && originalStates.has(currentContents)
                        ? originalStates.get(currentContents)
                        : captureBitmapDrawState(currentContents);
                    if (originalState) {
                        try { applyBitmapDrawState(currentContents, originalState); } catch (_) {}
                    }
                }
            }
        };
    }

    function disposeGameMessageTextScaleScope(windowInstance) {
        if (!windowInstance || !windowInstance._trGameMessageTextScaleScope) return;
        try {
            windowInstance._trGameMessageTextScaleScope.restore();
        } catch (_) {}
        windowInstance._trGameMessageTextScaleScope = null;
        windowInstance._trGameMessageTextScaleContents = null;
    }

    function ensureGameMessageTextScaleScope(windowInstance) {
        if (!windowInstance || !windowInstance.contents) return null;
        if (!Number.isInteger(gameMessageTextScale) || gameMessageTextScale <= 0 || gameMessageTextScale >= 100) {
            disposeGameMessageTextScaleScope(windowInstance);
            return null;
        }
        if (windowInstance._trGameMessageTextScaleScope) {
            windowInstance._trGameMessageTextScaleContents = windowInstance.contents;
            return windowInstance._trGameMessageTextScaleScope;
        }
        disposeGameMessageTextScaleScope(windowInstance);
        const scope = createGameMessageTextScaleScope(windowInstance, gameMessageTextScale);
        if (scope) {
            windowInstance._trGameMessageTextScaleScope = scope;
            windowInstance._trGameMessageTextScaleContents = windowInstance.contents;
        }
        return scope;
    }

    function getCurrentGameMessageLineHeight(windowInstance) {
        if (!windowInstance || !windowInstance.contents) return 32;
        const fontSize = Number(windowInstance.contents.fontSize);
        return Number.isFinite(fontSize) && fontSize > 0 ? fontSize + 8 : 32;
    }

    function resetGameMessageWrapPageState(windowInstance, wrapState) {
        if (typeof windowInstance.resetFontSettings === 'function') {
            windowInstance.resetFontSettings();
        }
        wrapState.currentX = wrapState.startX;
        wrapState.currentY = 0;
        wrapState.hasContentOnLine = false;
        wrapState.trimLeadingWhitespace = false;
        wrapState.lineHeight = getCurrentGameMessageLineHeight(windowInstance);
    }

    function commitGameMessageWrapLineBreak(windowInstance, wrapState, inserted) {
        wrapState.currentX = wrapState.startX;
        wrapState.currentY += wrapState.lineHeight;
        wrapState.hasContentOnLine = false;
        wrapState.trimLeadingWhitespace = !!inserted;
        wrapState.lineHeight = getCurrentGameMessageLineHeight(windowInstance);
        if (wrapState.contentsHeight > 0
            && wrapState.currentY + wrapState.lineHeight > wrapState.contentsHeight) {
            resetGameMessageWrapPageState(windowInstance, wrapState);
        }
    }

    function readGameMessageEscapeToken(text, index) {
        if (text.charAt(index) !== '\x1b') return null;
        let cursor = index + 1;
        let raw = '\x1b';
        let code = '';
        const codeMatch = GAME_MESSAGE_ESCAPE_CODE_PATTERN.exec(text.slice(cursor));
        if (codeMatch && codeMatch[0]) {
            code = String(codeMatch[0] || '');
            cursor += code.length;
            raw += code;
        }
        let param = null;
        const paramMatch = GAME_MESSAGE_NUMERIC_PARAM_PATTERN.exec(text.slice(cursor));
        if (paramMatch && paramMatch[0]) {
            raw += paramMatch[0];
            cursor += paramMatch[0].length;
            param = parseInt(paramMatch[0].slice(1, -1), 10);
        }
        return {
            type: 'escape',
            raw,
            code: code.toUpperCase(),
            param,
            nextIndex: cursor,
        };
    }

    function isGameMessageWhitespace(character) {
        return character === ' ' || character === '\t';
    }

    function isGameMessageCjkCharacter(character) {
        return GAME_MESSAGE_CJK_CHAR_PATTERN.test(character);
    }

    function tokenizeGameMessageText(text) {
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
                const escapeToken = readGameMessageEscapeToken(source, index);
                if (escapeToken) {
                    tokens.push(escapeToken);
                    index = escapeToken.nextIndex;
                    continue;
                }
            }
            if (isGameMessageWhitespace(character)) {
                let end = index + 1;
                while (end < source.length && isGameMessageWhitespace(source.charAt(end))) {
                    end += 1;
                }
                tokens.push({ type: 'space', raw: source.slice(index, end) });
                index = end;
                continue;
            }
            if (isGameMessageCjkCharacter(character)) {
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
                    || isGameMessageWhitespace(nextChar)
                    || isGameMessageCjkCharacter(nextChar)) {
                    break;
                }
                end += 1;
            }
            tokens.push({ type: 'text', raw: source.slice(index, end), forceCharWrap: false });
            index = end;
        }

        return tokens;
    }

    function measureGameMessageTokenWidth(windowInstance, token) {
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
            if (typeof windowInstance.textWidth === 'function') {
                return Math.max(0, Math.ceil(windowInstance.textWidth(raw)));
            }
            if (windowInstance.contents && typeof windowInstance.contents.measureTextWidth === 'function') {
                return Math.max(0, Math.ceil(windowInstance.contents.measureTextWidth(raw)));
            }
        } catch (_) {}
        return raw.length * Math.max(1, Math.round(getCurrentGameMessageLineHeight(windowInstance) / 2));
    }

    function applyGameMessageEscapeToken(windowInstance, wrapState, token) {
        if (!windowInstance || !token || token.type !== 'escape') return;
        switch (token.code) {
        case '{':
            if (typeof windowInstance.makeFontBigger === 'function') {
                windowInstance.makeFontBigger();
            }
            wrapState.lineHeight = Math.max(wrapState.lineHeight, getCurrentGameMessageLineHeight(windowInstance));
            break;
        case '}':
            if (typeof windowInstance.makeFontSmaller === 'function') {
                windowInstance.makeFontSmaller();
            }
            wrapState.lineHeight = Math.max(wrapState.lineHeight, getCurrentGameMessageLineHeight(windowInstance));
            break;
        case 'I':
            wrapState.currentX += measureGameMessageTokenWidth(windowInstance, token);
            wrapState.hasContentOnLine = true;
            break;
        default:
            break;
        }
    }

    function appendMeasuredGameMessageText(windowInstance, wrapState, output, raw) {
        const token = { type: 'text', raw };
        wrapState.lineHeight = Math.max(wrapState.lineHeight, getCurrentGameMessageLineHeight(windowInstance));
        wrapState.currentX += measureGameMessageTokenWidth(windowInstance, token);
        wrapState.hasContentOnLine = true;
        wrapState.trimLeadingWhitespace = false;
        output.push(raw);
    }

    function appendGameMessageTextRun(windowInstance, wrapState, output, raw) {
        const text = String(raw || '');
        if (!text) return;
        const tokenWidth = measureGameMessageTokenWidth(windowInstance, { type: 'text', raw: text });
        if (wrapState.currentX + tokenWidth <= wrapState.contentsWidth) {
            appendMeasuredGameMessageText(windowInstance, wrapState, output, text);
            return;
        }

        if (wrapState.hasContentOnLine) {
            output.push('\n');
            commitGameMessageWrapLineBreak(windowInstance, wrapState, true);
        }

        const fullWidth = measureGameMessageTokenWidth(windowInstance, { type: 'text', raw: text });
        if (fullWidth <= wrapState.contentsWidth || text.length <= 1) {
            appendMeasuredGameMessageText(windowInstance, wrapState, output, text);
            return;
        }

        for (const character of Array.from(text)) {
            const charWidth = measureGameMessageTokenWidth(windowInstance, { type: 'text', raw: character });
            if (wrapState.hasContentOnLine && wrapState.currentX + charWidth > wrapState.contentsWidth) {
                output.push('\n');
                commitGameMessageWrapLineBreak(windowInstance, wrapState, true);
            }
            appendMeasuredGameMessageText(windowInstance, wrapState, output, character);
        }
    }

    function wrapGameMessageText(windowInstance, text) {
        if (!windowInstance || !windowInstance.contents) return String(text || '');
        const source = String(text || '');
        if (!source) return source;

        ensureGameMessageTextScaleScope(windowInstance);
        if (typeof windowInstance.resetFontSettings === 'function') {
            windowInstance.resetFontSettings();
        }

        const startX = (() => {
            try {
                if (typeof windowInstance.newLineX === 'function') {
                    const value = Number(windowInstance.newLineX());
                    if (Number.isFinite(value)) return Math.max(0, value);
                }
            } catch (_) {}
            const fallback = resolveMessageStartCoordinates(windowInstance);
            return Number.isFinite(fallback.x) ? Math.max(0, fallback.x) : 0;
        })();
        const contentsWidth = windowInstance.contents && Number.isFinite(windowInstance.contents.width)
            ? Math.max(startX + 1, Number(windowInstance.contents.width))
            : Number.MAX_SAFE_INTEGER;
        const contentsHeight = windowInstance.contents && Number.isFinite(windowInstance.contents.height)
            ? Math.max(1, Number(windowInstance.contents.height))
            : Number.MAX_SAFE_INTEGER;

        const wrapState = {
            startX,
            currentX: startX,
            currentY: 0,
            contentsWidth,
            contentsHeight,
            lineHeight: getCurrentGameMessageLineHeight(windowInstance),
            hasContentOnLine: false,
            trimLeadingWhitespace: false,
        };
        const output = [];
        const tokens = tokenizeGameMessageText(source);

        for (const token of tokens) {
            if (!token) continue;

            if (token.type === 'newline') {
                output.push(token.raw);
                commitGameMessageWrapLineBreak(windowInstance, wrapState, false);
                continue;
            }

            if (token.type === 'newpage') {
                output.push(token.raw);
                resetGameMessageWrapPageState(windowInstance, wrapState);
                continue;
            }

            if (token.type === 'escape') {
                if (token.code === 'I') {
                    const iconWidth = measureGameMessageTokenWidth(windowInstance, token);
                    if (wrapState.hasContentOnLine && wrapState.currentX + iconWidth > wrapState.contentsWidth) {
                        output.push('\n');
                        commitGameMessageWrapLineBreak(windowInstance, wrapState, true);
                    }
                }
                output.push(token.raw);
                applyGameMessageEscapeToken(windowInstance, wrapState, token);
                continue;
            }

            if (token.type === 'space') {
                if (wrapState.trimLeadingWhitespace) {
                    continue;
                }
                const spaceWidth = measureGameMessageTokenWidth(windowInstance, token);
                if (wrapState.hasContentOnLine && wrapState.currentX + spaceWidth > wrapState.contentsWidth) {
                    output.push('\n');
                    commitGameMessageWrapLineBreak(windowInstance, wrapState, true);
                    continue;
                }
                wrapState.currentX += spaceWidth;
                wrapState.hasContentOnLine = wrapState.hasContentOnLine || token.raw.length > 0;
                output.push(token.raw);
                continue;
            }

            appendGameMessageTextRun(windowInstance, wrapState, output, token.raw);
        }

        if (typeof windowInstance.resetFontSettings === 'function') {
            windowInstance.resetFontSettings();
        }
        return output.join('');
    }

    function canUseNativeGameMessageRender(windowInstance) {
        if (!windowInstance || !windowInstance.contents) return false;
        if (typeof windowInstance.newPage !== 'function'
            || typeof windowInstance.processCharacter !== 'function'
            || typeof windowInstance.isEndOfText !== 'function'
            || typeof windowInstance.onEndOfText !== 'function') {
            return false;
        }
        if (typeof windowInstance.isAnySubWindowActive === 'function' && windowInstance.isAnySubWindowActive()) {
            return false;
        }
        return true;
    }

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

    function createNativeGameMessageTextState(windowInstance, text, overrides = {}) {
        const wrappedText = wrapGameMessageText(windowInstance, text);
        const coords = resolveMessageStartCoordinates(windowInstance, overrides);

        // MZ message windows rely on a richer text-state shape with buffered text
        // output; MV-style minimal states leave redraws blank after contents clear.
        if (typeof windowInstance.createTextState === 'function') {
            const textState = windowInstance.createTextState(wrappedText, 0, coords.y, 0);
            const startX = Number.isFinite(coords.x)
                ? coords.x
                : (typeof windowInstance.newLineX === 'function' ? windowInstance.newLineX(textState) : 0);
            textState.x = startX;
            textState.startX = startX;
            if (Number.isFinite(coords.y)) {
                textState.y = coords.y;
                if (typeof textState.startY === 'number') {
                    textState.startY = coords.y;
                }
            }
            return textState;
        }

        return {
            index: 0,
            text: wrappedText,
        };
    }

    function flushNativeGameMessageText(windowInstance) {
        if (!windowInstance || !windowInstance._textState) return false;
        const textState = windowInstance._textState;
        const originalPause = !!windowInstance.pause;
        const originalWait = Number(windowInstance._waitCount) || 0;
        windowInstance.pause = false;
        windowInstance._waitCount = 0;
        windowInstance._showFast = true;
        const previousBypass = windowInstance._trBypassProcessCharacter || 0;
        windowInstance._trBypassProcessCharacter = previousBypass + 1;
        try {
            while (windowInstance._textState && !windowInstance.isEndOfText(textState)) {
                if (typeof windowInstance.needsNewPage === 'function' && windowInstance.needsNewPage(textState)) {
                    windowInstance.newPage(textState);
                    windowInstance._showFast = true;
                    drawMessageFaceIfReady(windowInstance);
                }
                windowInstance.processCharacter(textState);
                if (windowInstance.pause || windowInstance._waitCount > 0) {
                    break;
                }
            }
            // MZ buffers printable glyphs in textState.buffer and only paints them
            // when flushTextState runs; MV never exposes this helper.
            if (typeof windowInstance.flushTextState === 'function') {
                windowInstance.flushTextState(textState);
            }
            const isWaiting = typeof windowInstance.isWaiting === 'function'
                ? windowInstance.isWaiting()
                : (windowInstance.pause || windowInstance._waitCount > 0);
            if (windowInstance._textState && windowInstance.isEndOfText(textState) && !isWaiting) {
                windowInstance.onEndOfText();
            }
        } catch (error) {
            windowInstance.pause = originalPause;
            windowInstance._waitCount = originalWait;
            throw error;
        } finally {
            windowInstance._trBypassProcessCharacter = Math.max(0, (windowInstance._trBypassProcessCharacter || 1) - 1);
        }
        return true;
    }

    function redrawGameMessageTextFallback(windowInstance, text, overrides = {}) {
        if (!windowInstance || !windowInstance.contents) return false;

        try { windowInstance.contents.clear(); } catch (_) {}
        if (typeof windowInstance.resetFontSettings === 'function') windowInstance.resetFontSettings();
        drawMessageFaceIfNeeded(windowInstance);

        const coords = resolveMessageStartCoordinates(windowInstance, overrides);
        const signed = REDRAW_SIGNATURE + text;
        windowInstance._trBypassProcessCharacter = (windowInstance._trBypassProcessCharacter || 0) + 1;
        const scaleScope = createGameMessageTextScaleScope(windowInstance, gameMessageTextScale);
        try {
            windowInstance.drawTextEx(signed, coords.x, coords.y);
            if (windowInstance._textState) {
                windowInstance._textState.index = windowInstance._textState.text.length;
            }
            windowInstance._showFast = true;
            windowInstance._lineShowFast = true;
        } finally {
            if (scaleScope) {
                scaleScope.restore();
            }
            windowInstance._trBypassProcessCharacter = Math.max(0, (windowInstance._trBypassProcessCharacter || 1) - 1);
        }
        return true;
    }

    function redrawGameMessageText(windowInstance, text, overrides = {}) {
        if (!windowInstance || !windowInstance.contents) return false;
        markDedicatedMessageWindow(windowInstance);
        if (!canUseNativeGameMessageRender(windowInstance)) {
            disposeGameMessageTextScaleScope(windowInstance);
            return redrawGameMessageTextFallback(windowInstance, text, overrides);
        }

        try {
            ensureGameMessageTextScaleScope(windowInstance);
            const textState = createNativeGameMessageTextState(windowInstance, text, overrides);
            windowInstance._textState = textState;
            windowInstance.newPage(textState);
            if (typeof windowInstance.updatePlacement === 'function') {
                windowInstance.updatePlacement();
            }
            if (typeof windowInstance.updateBackground === 'function') {
                windowInstance.updateBackground();
            }
            if (typeof windowInstance.open === 'function') {
                windowInstance.open();
            }
            drawMessageFaceIfReady(windowInstance);
            windowInstance._trMsgStartX = typeof textState.startX === 'number'
                ? textState.startX
                : (typeof textState.left === 'number' ? textState.left : resolveMessageStartCoordinates(windowInstance, overrides).x);
            windowInstance._trMsgStartY = typeof textState.startY === 'number'
                ? textState.startY
                : (typeof textState.y === 'number' ? textState.y : 0);
            windowInstance._trWrappedMessageText = String(textState.text || text || '');

            return flushNativeGameMessageText(windowInstance);
        } catch (error) {
            disposeGameMessageTextScaleScope(windowInstance);
            logger.warn('[GameMessage] Native render failed; falling back to drawTextEx redraw.', error);
            return redrawGameMessageTextFallback(windowInstance, text, overrides);
        }
    }

    function createEscapeAwarePayload(rawText, context = 'message') {
        const resolved = String(rawText || '');
        const visible = stripRpgmEscapes(resolved).trim();
        if (!visible) return null;

        let placeholderInfo = null;
        let translationSource = visible;
        try {
            placeholderInfo = prepareTextForTranslation(resolved);
            translationSource = placeholderInfo && placeholderInfo.textForTranslation
                ? String(placeholderInfo.textForTranslation || '')
                : String(visible || '');
        } catch (error) {
            logger.warn(`[GameMessage ${context}] prepareTextForTranslation failed; using stripped text.`, error);
            translationSource = String(visible || '');
        }

        const normalizedTranslationSource = String(translationSource || '').trim();

        return {
            resolved,
            visible,
            placeholderInfo,
            translationSource,
            normalizedTranslationSource,
        };
    }

    function restoreMessageText(translated, payload) {
        if (!payload) return translated;
        const candidate = translated;

        try {
            const restored = restoreControlCodes(candidate, payload.placeholderInfo, payload.resolved);
            if (typeof restored === 'string' && restored.length) {
                return restored;
            }
        } catch (error) {
            logger.warn('[GameMessage] restoreControlCodes failed; falling back to original text.', error);
        }
        const stripped = stripRpgmEscapes(candidate || '').trim();
        logEscape('debug', 'restoreControlCodes threw; using stripped translated text as fallback.', {
            strippedPreview: preview(stripped),
        });
        return stripped || payload.resolved;
    }

    function restoreMessageTextStreaming(translated, payload) {
        if (!payload || typeof translated !== 'string') return translated;
        if (!payload.placeholderInfo) return translated;
        try {
            const restored = restoreControlCodes(translated, payload.placeholderInfo, payload.resolved);
            return typeof restored === 'string' ? restored : translated;
        } catch (_) {
            return translated;
        }
    }

    function trackGameMessage() {
        if (typeof Window_Message === 'undefined' || !Window_Message || !Window_Message.prototype) {
            diag('[GameMessage] Window_Message unavailable; skipping message hooks.');
            return;
        }

        const trackedMessageWindows = new Set();
        const fallbackMessageState = {
            currentText: '',
            isActive: false,
            lastUpdate: 0,
            session: 0,
            source: null,
        };

        const createMessageState = () => ({
            currentText: '',
            isActive: false,
            lastUpdate: 0,
            session: 0,
            source: null,
        });

        const getMessageState = (windowInstance) => {
            if (!windowInstance) return fallbackMessageState;
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
        };

        const resetStreamState = (windowInstance, abortActive = true) => {
            if (!windowInstance) return;
            if (abortActive) {
                try {
                    if (windowInstance._trStreamAbort && typeof windowInstance._trStreamAbort.abort === 'function') {
                        windowInstance._trStreamAbort.abort();
                    }
                } catch (_) {}
            }
            windowInstance._trStreamAbort = null;
            windowInstance._trStreamText = '';
            windowInstance._trStreamSessionId = null;
            windowInstance._trStreamLoopActive = false;
            windowInstance._trStreamDeferredLogged = false;
        };

        const beginWindowMessageSession = (windowInstance, options = {}) => {
            const state = getMessageState(windowInstance);
            state.session++;
            state.isActive = true;
            state.lastUpdate = Date.now();
            windowInstance._trMessageSession = state.session;
            windowInstance._trStartedThisSession = !!options.started;
            windowInstance._trSentTranslateThisSession = false;
            windowInstance._trMsgStartSession = windowInstance._trMessageSession;
            windowInstance._trCurrentMessagePayload = null;
            windowInstance._trPendingRedraw = null;
            windowInstance._trWrappedMessageText = null;
            resetStreamState(windowInstance, true);
            return state;
        };

        const resetWindowMessageState = (windowInstance) => {
            if (!windowInstance) return null;
            const state = getMessageState(windowInstance);
            state.currentText = '';
            state.isActive = false;
            state.lastUpdate = Date.now();
            state.session++;
            disposeGameMessageTextScaleScope(windowInstance);
            windowInstance._trStartedThisSession = false;
            windowInstance._trSentTranslateThisSession = false;
            windowInstance._trMsgStartSession = null;
            windowInstance._trCurrentMessagePayload = null;
            windowInstance._trMsgStartX = undefined;
            windowInstance._trMsgStartY = undefined;
            windowInstance._trSessionId = null;
            windowInstance._trPendingRedraw = null;
            windowInstance._trWrappedMessageText = null;
            resetStreamState(windowInstance, true);
            return state;
        };

        const isSessionCurrent = (windowInstance, sessionId) => {
            const state = getMessageState(windowInstance);
            return windowInstance
                && windowInstance._trSessionId === sessionId
                && state.isActive
                && state.session === sessionId;
        };

        const captureTextStateStart = (windowInstance) => {
            try {
                if (windowInstance && windowInstance._textState) {
                    if (typeof windowInstance._textState.startX === 'number') {
                        windowInstance._trMsgStartX = windowInstance._textState.startX;
                    } else if (typeof windowInstance._textState.x === 'number') {
                        windowInstance._trMsgStartX = windowInstance._textState.x;
                    }
                    if (typeof windowInstance._textState.y === 'number') {
                        windowInstance._trMsgStartY = windowInstance._textState.y;
                    }
                }
            } catch (_) {}
        };

        const getResolvedTextForWindow = (windowInstance) => {
            const gameMessage = getGameMessageForWindow(windowInstance);
            const rawAll = gameMessage && typeof gameMessage.allText === 'function'
                ? gameMessage.allText()
                : '';
            return typeof windowInstance.convertEscapeCharacters === 'function'
                ? windowInstance.convertEscapeCharacters(String(rawAll))
                : String(rawAll);
        };

        const collectSceneMessageWindows = (addWindow) => {
            try {
                const scene = typeof SceneManager !== 'undefined' && SceneManager ? SceneManager._scene : null;
                if (!scene) return;
                const visit = (value) => {
                    if (!value) return;
                    if (isMessageWindowLike(value)) {
                        addWindow(value);
                        return;
                    }
                    if (Array.isArray(value)) {
                        value.forEach((item) => {
                            if (isMessageWindowLike(item)) addWindow(item);
                        });
                    }
                };
                Object.keys(scene).forEach((key) => visit(scene[key]));
            } catch (_) {}
        };

        const collectWindowsForGameMessage = (gameMessage) => {
            const matches = [];
            const seen = new Set();
            const addIfMatch = (windowInstance) => {
                if (!windowInstance || seen.has(windowInstance) || !isMessageWindowLike(windowInstance)) return;
                const state = windowInstance._trGameMessageState || null;
                const source = (state && state.source)
                    || windowInstance._trGameMessageSource
                    || getGameMessageForWindow(windowInstance);
                if (source !== gameMessage) return;
                seen.add(windowInstance);
                matches.push(windowInstance);
            };

            trackedMessageWindows.forEach(addIfMatch);
            try {
                if (registeredWindows && typeof registeredWindows.forEach === 'function') {
                    registeredWindows.forEach(addIfMatch);
                }
            } catch (_) {}
            collectSceneMessageWindows(addIfMatch);
            return matches;
        };

        // Ensure Window_Message contents are marked for bitmap-level bypass
        const wrapMessageContents = (Ctor) => {
            if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.createContents !== 'function') return;
            try {
                Ctor.prototype._trHasDedicatedTextHook = true;
                Ctor._trHasDedicatedTextHook = true;
            } catch (_) {}
            if (Ctor.prototype.createContents.__trWrapped) return;
            const originalCreateContents = Ctor.prototype.createContents;
            Ctor.prototype.createContents = function(...args) {
                const res = originalCreateContents.apply(this, args);
                markDedicatedMessageWindow(this);
                return res;
            };
            Ctor.prototype.createContents.__trWrapped = true;
            Ctor.prototype.createContents.__trOriginal = originalCreateContents;
        };

        const installStartMessageHook = (Ctor, force = false) => {
            if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.startMessage !== 'function') return false;
            const ownsStart = Object.prototype.hasOwnProperty.call(Ctor.prototype, 'startMessage');
            if (!force && !ownsStart) return false;
            const currentStartMessage = Ctor.prototype.startMessage;
            if (currentStartMessage.__trWrapped) return true;
            const originalStartMessage = currentStartMessage.__trOriginal || currentStartMessage;
            const wrappedStartMessage = function(...args) {
                markDedicatedMessageWindow(this);
                disposeGameMessageTextScaleScope(this);
                const res = originalStartMessage.apply(this, args);
                try {
                    const state = beginWindowMessageSession(this, { started: true });
                    captureTextStateStart(this);

                    const resolved = getResolvedTextForWindow(this);
                    const payload = createEscapeAwarePayload(resolved, 'start');
                    const finalText = payload ? payload.visible : stripRpgmEscapes(resolved).trim();
                    if (finalText && finalText !== state.currentText) {
                        state.currentText = finalText;
                        diag(`[GameMessage] Final rendered text: "${preview(finalText)}"`);
                        if (!this._trSentTranslateThisSession) {
                            this._trSentTranslateThisSession = true;
                            this.processCompleteMessage(payload || resolved, state.session);
                        }
                    }
                } catch (e) { logger.warn('[GameMessage startMessage hook error]', e); }
                return res;
            };
            wrappedStartMessage.__trOriginal = originalStartMessage;
            wrappedStartMessage.__trWrapped = true;
            Ctor.prototype.startMessage = wrappedStartMessage;
            return true;
        };

        const installMessageWindowCtorHooks = (Ctor, force = false) => {
            if (!Ctor || !Ctor.prototype) return;
            try {
                wrapMessageContents(Ctor);
                installStartMessageHook(Ctor, force);
                Ctor.prototype._trHasDedicatedTextHook = true;
                Ctor._trHasDedicatedTextHook = true;
            } catch (_) {}
        };

        const discoverAndHookMessageWindowCtors = () => {
            installMessageWindowCtorHooks(Window_Message, true);
            try {
                if (typeof Window_Message_Battle !== 'undefined') {
                    installMessageWindowCtorHooks(Window_Message_Battle, true);
                }
            } catch (_) {}
            try {
                Object.keys(globalScope).forEach((key) => {
                    const Ctor = globalScope[key];
                    if (!Ctor || typeof Ctor !== 'function' || !Ctor.prototype) return;
                    if (Ctor === Window_Message) return;
                    try {
                        if (Window_Message.prototype.isPrototypeOf(Ctor.prototype)) {
                            installMessageWindowCtorHooks(Ctor, false);
                        }
                    } catch (_) {}
                });
            } catch (_) {}
            collectSceneMessageWindows((windowInstance) => {
                try {
                    if (windowInstance && windowInstance.constructor) {
                        installMessageWindowCtorHooks(windowInstance.constructor, false);
                    }
                    markDedicatedMessageWindow(windowInstance);
                } catch (_) {}
            });
        };

        discoverAndHookMessageWindowCtors();

        const redrawMessageText = (windowInstance, text, sessionId, overrides = {}) => {
            if (!windowInstance) return false;
            const isOpen = typeof windowInstance.isOpen === 'function' ? windowInstance.isOpen() : true;
            const ready = windowInstance.contents && windowInstance.visible && isOpen;
            const coords = resolveMessageStartCoordinates(windowInstance, overrides);
            if (!ready) {
                windowInstance._trPendingRedraw = { text, sessionId, x: coords.x, y: coords.y };
                return false;
            }
            return redrawGameMessageText(windowInstance, text, overrides);
        };

        // Hook Window_Message.prototype.processCharacter only as a fallback
        const currentProcessCharacter = Window_Message.prototype.processCharacter;
        if (currentProcessCharacter && !currentProcessCharacter.__trWrapped) {
            const originalProcessCharacter = currentProcessCharacter.__trOriginal || currentProcessCharacter;
            const wrappedProcessCharacter = function(textState) {
                markDedicatedMessageWindow(this);
                // If we're drawing our own translated text, bypass translation logic
                if (this._trBypassProcessCharacter && this._trBypassProcessCharacter > 0) {
                    return originalProcessCharacter.call(this, textState);
                }

                const state = getMessageState(this);
                // If startMessage already handled this session, skip accumulation to avoid truncation issues
                if (state.isActive
                    && this._trStartedThisSession
                    && this._trSentTranslateThisSession
                    && this._trMessageSession === state.session) {
                    return originalProcessCharacter.call(this, textState);
                }

                const sourceText = textState && textState.text ? String(textState.text) : '';
                if (!this._trCurrentMessagePayload) {
                    beginWindowMessageSession(this, { started: false });
                    this._trCurrentMessagePayload = createEscapeAwarePayload(sourceText, 'processCharacter');
                }

                const result = originalProcessCharacter.call(this, textState);

                if (textState
                    && typeof textState.text === 'string'
                    && textState.index >= textState.text.length) {
                    const payload = this._trCurrentMessagePayload || createEscapeAwarePayload(sourceText, 'processCharacter-final');
                    this._trCurrentMessagePayload = null;
                    const activeState = getMessageState(this);
                    const finalText = payload ? payload.visible : stripRpgmEscapes(sourceText).trim();
                    if (finalText && finalText !== activeState.currentText) {
                        activeState.currentText = finalText;
                        diag(`[GameMessage] Final rendered text: "${preview(finalText)}"`);
                        this.processCompleteMessage(payload || sourceText, this._trMessageSession);
                    } else if (payload) {
                        this.processCompleteMessage(payload, this._trMessageSession);
                    }
                }

                return result;
            };
            wrappedProcessCharacter.__trOriginal = originalProcessCharacter;
            wrappedProcessCharacter.__trWrapped = true;
            Window_Message.prototype.processCharacter = wrappedProcessCharacter;
        }

        // Process complete message text for translation
        Window_Message.prototype.processCompleteMessage = function(message, sessionId) {
            markDedicatedMessageWindow(this);
            const payload = (message && typeof message === 'object' && ('resolved' in message || 'visible' in message))
                ? message
                : createEscapeAwarePayload(message, 'processComplete');
            if (!payload || !payload.visible) {
                diag('[GameMessage] Skipping translation: empty message');
                return;
            }

            const translationSource = payload.translationSource;
            const normalizedSource = payload.normalizedTranslationSource
                || String(translationSource || '').trim();
            if (!normalizedSource || translationCache.shouldSkip(normalizedSource)) {
                diag(`[GameMessage] Skipping translation: "${preview(payload.visible)}"`);
                return;
            }

            this._trSessionId = sessionId;

            try {
                if (this._trStreamAbort && typeof this._trStreamAbort.abort === 'function') {
                    this._trStreamAbort.abort();
                }
            } catch (_) {}
            this._trStreamAbort = null;
            this._trStreamText = '';
            this._trStreamSessionId = sessionId;
            this._trStreamLoopActive = false;
            this._trStreamDeferredLogged = false;

            const stopStreamLoop = (preserveText = true) => {
                if (this._trStreamSessionId !== sessionId) return;
                this._trStreamLoopActive = false;
                this._trStreamSessionId = null;
                this._trStreamDeferredLogged = false;
                if (!preserveText) {
                    this._trStreamText = '';
                }
            };

            const restoreOriginalAfterStreamPreview = () => {
                if (!isSessionCurrent(this, sessionId)) return;
                if (typeof this._trStreamText !== 'string' || !this._trStreamText) return;
                redrawMessageText(this, payload.resolved, sessionId);
            };

            const applyStreamDelta = (partial) => {
                if (!isSessionCurrent(this, sessionId)) return;
                if (typeof partial !== 'string' || !partial) return;
                const restored = restoreMessageTextStreaming(partial, payload);
                if (!restored || restored === this._trStreamText) return;
                const restoredVisible = stripRpgmEscapes(restored || '').trim();
                if (!restoredVisible) return;
                this._trStreamText = restored;
                this._trStreamLoopActive = true;
                if (!this._trStreamDeferredLogged) {
                    diag('[GameMessage] Starting streamed redraw loop.');
                    this._trStreamDeferredLogged = true;
                }
            };

            const requestStream = translationCache
                && typeof translationCache.requestTranslationStream === 'function'
                    ? translationCache.requestTranslationStream
                    : null;
            const streamController = (requestStream && typeof AbortController !== 'undefined')
                ? new AbortController()
                : null;
            if (streamController) this._trStreamAbort = streamController;

            const translationPromise = requestStream
                ? requestStream.call(translationCache, translationSource, {
                    onDelta: applyStreamDelta,
                    signal: streamController ? streamController.signal : undefined
                })
                : translationCache.requestTranslation(translationSource);

            translationPromise
                .then(translated => {
                    // Check if session is still valid
                    if (!isSessionCurrent(this, sessionId)) {
                        stopStreamLoop(true);
                        diag(`[GameMessage] Session expired for: "${preview(payload.visible)}"`);
                        return;
                    }

                    let restored = restoreMessageText(translated, payload);
                    if (typeof restored !== 'string' || !restored.trim()) {
                        restored = payload.resolved;
                    }

                    const restoredVisible = stripRpgmEscapes(restored || '').trim();
                    if (!restoredVisible) {
                        stopStreamLoop(true);
                        restoreOriginalAfterStreamPreview();
                        dbg('[GameMessage Skip] Restored text empty after stripping; keeping original.');
                        return;
                    }

                    if (restoredVisible === payload.visible) {
                        stopStreamLoop(true);
                        restoreOriginalAfterStreamPreview();
                        dbg(`[GameMessage Skip] Original and translated text are identical: "${preview(payload.visible)}"`);
                        return;
                    }

                    stopStreamLoop(true);
                    dbg(`[GameMessage] Translation: "${preview(payload.visible)}" -> "${preview(restoredVisible)}"`);
                    redrawMessageText(this, restored, sessionId);
                })
                .catch(err => {
                    stopStreamLoop(true);
                    if (isAbortErrorLike(err)) return;
                    restoreOriginalAfterStreamPreview();
                    logger.error('[GameMessage Translation Error]', err);
                });
        };

        // Hook $gameMessage.clear() - when message is cleared/becomes invisible
        if (typeof Game_Message !== 'undefined'
            && Game_Message
            && Game_Message.prototype
            && typeof Game_Message.prototype.clear === 'function'
            && !Game_Message.prototype.clear.__trWrapped) {
            const originalClear = Game_Message.prototype.clear.__trOriginal || Game_Message.prototype.clear;
            const wrappedClear = function(...args) {
                const result = originalClear.apply(this, args);
                const windows = collectWindowsForGameMessage(this);
                let diagnosticState = null;
                windows.forEach((windowInstance) => {
                    diagnosticState = resetWindowMessageState(windowInstance) || diagnosticState;
                });
                if (!diagnosticState) {
                    fallbackMessageState.currentText = '';
                    fallbackMessageState.isActive = false;
                    fallbackMessageState.lastUpdate = Date.now();
                    fallbackMessageState.session++;
                    diagnosticState = fallbackMessageState;
                }

                diag('Game_Message.clear() - Message cleared');
                showGameMessageDiagnostics(diagnosticState);

                return result;
            };
            wrappedClear.__trOriginal = originalClear;
            wrappedClear.__trWrapped = true;
            Game_Message.prototype.clear = wrappedClear;
        }

        function showGameMessageDiagnostics(state = fallbackMessageState) {
            if (!logger.shouldLog('trace')) return;
            const status = state.isActive ? 'active' : 'cleared';
            const timestamp = new Date(state.lastUpdate).toLocaleTimeString();
            const textPreview = state.currentText
                ? preview(state.currentText)
                : '(empty)';
            logger.trace(`[GameMessage] state=${status} updated=${timestamp} text="${textPreview}"`);
        }
    }

    function trackChoiceList() {
        if (typeof Window_ChoiceList === 'undefined' || !Window_ChoiceList || !Window_ChoiceList.prototype) {
            diag('[Choice] Window_ChoiceList unavailable; skipping choice hooks');
            return;
        }

        const originalMakeCommandList = Window_ChoiceList.prototype.makeCommandList;
        if (typeof originalMakeCommandList !== 'function') {
            logger.warn('[Choice] makeCommandList not found; skipping choice hooks');
            return;
        }

        Window_ChoiceList.prototype.makeCommandList = function() {
            const result = originalMakeCommandList.call(this);
            try {
                if (!translationCache || typeof translationCache.requestTranslation !== 'function') {
                    return result;
                }

                const commands = Array.isArray(this._list) ? this._list : [];
                if (!commands.length) return result;

                this._trChoiceSessionId = (this._trChoiceSessionId || 0) + 1;
                const sessionId = this._trChoiceSessionId;
                const choiceWindow = this;

                commands.forEach((command, index) => {
                    if (!command || typeof command.name !== 'string') return;

                    const rawName = command.name;
                    let converted = rawName;
                    try { converted = choiceWindow.convertEscapeCharacters(rawName); } catch (_) {}

                    const visible = stripRpgmEscapes(converted).trim();
                    if (!visible || translationCache.shouldSkip(visible)) {
                        return;
                    }

                    telemetry.logTextDetected('choice', visible, index, 0, { windowType: 'Window_ChoiceList' });

                    const placeholderInfo = prepareTextForTranslation(converted);
                    const translationSource = placeholderInfo.textForTranslation;
                    const normalizedSource = String(translationSource || '').trim();
                    if (!normalizedSource) return;

                    const applyTranslated = (translated) => {
                        if (choiceWindow._trChoiceSessionId !== sessionId) return;
                        if (typeof translated !== 'string' || !translated.trim()) return;

                        let restored = restoreControlCodes(translated, placeholderInfo, converted);
                        if (!restored) restored = converted;

                        const restoredVisible = stripRpgmEscapes(restored).trim();
                        if (!restoredVisible || restoredVisible === visible) {
                            return;
                        }

                        const entry = choiceWindow._list && choiceWindow._list[index];
                        if (!entry) return;

                        const finalText = restored.startsWith(REDRAW_SIGNATURE)
                            ? restored
                            : REDRAW_SIGNATURE + restored;

                        if (entry._trAppliedText === finalText) return;
                        entry._trAppliedText = finalText;
                        entry.name = finalText;

                        if (typeof choiceWindow.redrawItem === 'function') {
                            try { choiceWindow.redrawItem(index); return; } catch (_) {}
                        }
                        if (typeof choiceWindow.drawAllItems === 'function') {
                            try { choiceWindow.drawAllItems(); return; } catch (_) {}
                        }
                    };

                    if (translationCache.completed
                        && typeof translationCache.completed.has === 'function'
                        && translationCache.completed.has(normalizedSource)) {
                        applyTranslated(translationCache.completed.get(normalizedSource));
                        return;
                    }

                    translationCache.requestTranslation(translationSource)
                        .then(applyTranslated)
                        .catch((error) => {
                            logger.warn('[Choice] Translation error:', error);
                        });
                });
            } catch (error) {
                logger.error('[Choice] makeCommandList hook error', error);
            }
            return result;
        };
    }

    // Hook PIXI.Text and PIXI.BitmapText to capture whole-string text assignments.
    // Still treated as best-effort: hooks are installed only when the PIXI classes expose a writable text setter.
    function trackPixiText() {
        try {
            const PIXIObj = (typeof window !== 'undefined') ? (window.PIXI || window.Pixi || window.pixi) : null;
            if (!PIXIObj) { diag('[PIXI] Not found, skipping PIXI text hooks'); return; }

            const safeFindDescriptor = (proto, prop) => {
                let obj = proto;
                while (obj && obj !== Object.prototype) {
                    const d = Object.getOwnPropertyDescriptor(obj, prop);
                    if (d) return { owner: obj, desc: d };
                    obj = Object.getPrototypeOf(obj);
                }
                return null;
            };

            const installSetterHook = (Ctor, label) => {
                if (!Ctor || !Ctor.prototype) return false;
                if (Ctor.prototype.__trTextWrapped) return true;
                const found = safeFindDescriptor(Ctor.prototype, 'text');
                if (!found || typeof found.desc.set !== 'function') {
                    diag(`[PIXI] ${label}.text setter not found; skipping`);
                    return false;
                }

                const originalSetter = found.desc.set;
                const originalGetter = found.desc.get || function() { return this._text; };

                Object.defineProperty(found.owner, 'text', {
                    configurable: true,
                    enumerable: found.desc.enumerable,
                    get: originalGetter,
                    set: function(v) {
                        // candidate logging disabled
                        try {
                            const textStr = String(v);

                            // Bypass when our signature is present
                            if (textStr.startsWith(REDRAW_SIGNATURE)) {
                                const clean = textStr.substring(REDRAW_SIGNATURE.length);
                                return originalSetter.call(this, clean);
                            }

                            // Skip trivial strings (numbers, whitespace, symbols only)
                            if (translationCache.shouldSkip(textStr)) {
                                return originalSetter.call(this, textStr);
                            }

                            const placeholderInfo = prepareTextForTranslation(textStr);
                            const translationSource = placeholderInfo.textForTranslation;
                            const norm = String(translationSource || '').trim();
                            if (!norm || translationCache.shouldSkip(norm)) {
                                return originalSetter.call(this, textStr);
                            }

                            // Synchronous cache hit path
                            try {
                                if (translationCache.completed.has(norm)) {
                                    let translated = translationCache.completed.get(norm);
                                    translated = placeholderInfo
                                        ? restoreControlCodes(translated, placeholderInfo, textStr)
                                        : translated;
                                    // Skip replacement if original and translated text are the same
                                    if (typeof translated !== 'string' || translated.trim() === textStr.trim()) {
                                        dbg(`[PIXI Skip] Original and translated text are identical: "${preview(norm)}"`);
                                        return originalSetter.call(this, textStr);
                                    }
                                    const signed = REDRAW_SIGNATURE + translated;
                                    return originalSetter.call(this, signed);
                                }
                            } catch (_) {}

                            // Async path: set original now; when translation completes and still current, update
                            this._trTextVersion = (this._trTextVersion | 0) + 1;
                            const version = this._trTextVersion;
                            const versionPlaceholder = placeholderInfo;
                            const originalValue = textStr;
                            originalSetter.call(this, textStr);
                            translationCache.requestTranslation(translationSource)
                                .then(translated => {
                                    try {
                                        if (this._trTextVersion !== version) return; // superseded
                                        // Skip replacement if original and translated text are the same
                                        let restored = versionPlaceholder
                                            ? restoreControlCodes(translated, versionPlaceholder, originalValue)
                                            : translated;
                                        if (typeof restored !== 'string') restored = originalValue;
                                        if (restored.trim() === originalValue.trim()) {
                                            dbg(`[PIXI Async Skip] Original and translated text are identical: "${preview(norm)}"`);
                                            return;
                                        }
                                        const signed = REDRAW_SIGNATURE + restored;
                                        originalSetter.call(this, signed);
                                    } catch (e) {
                                        // ignore update errors
                                    }
                                })
                                .catch(() => { /* keep original on failure */ });
                        } catch (e) {
                            try { return originalSetter.call(this, v); } catch (_) {}
                        }
                    }
                });

                // Mark wrapper for idempotency (stored on descriptor is not portable; keep a symbol on Ctor)
                try { Ctor.prototype.__trTextWrapped = true; } catch (_) {}
                dbg(`[PIXI] Hooked ${label}.text setter`);
                return true;
            };

            let hookedAny = false;
            try { hookedAny = installSetterHook(PIXIObj.Text, 'PIXI.Text') || hookedAny; } catch (_) {}
            try { hookedAny = installSetterHook(PIXIObj.BitmapText, 'PIXI.BitmapText') || hookedAny; } catch (_) {}
            if (!hookedAny) diag('[PIXI] No text classes hooked');
        } catch (e) {
            logger.error('[PIXI Hook Error]', e);
        }
    }

    function trackBitmapDrawText() {
        try {
            if (typeof Bitmap === 'undefined' || !Bitmap || !Bitmap.prototype) {
                diag('[bitmap/init] Bitmap unavailable; skipping bitmap hooks.');
                return;
            }

            const DRAW_WRAPPER_TOKEN = Symbol('bitmapDrawWrapper');
            const SMALL_TEXT_WRAPPER_TOKEN = Symbol('bitmapSmallTextWrapper');
            const NORMAL_CHAR_WRAPPER_TOKEN = Symbol('bitmapNormalCharWrapper');
            const SPRITE_CHILD_OBSERVER_TOKEN = Symbol('spriteChildObserver');

            if (Bitmap.prototype.drawText && Bitmap.prototype.drawText.__trBitmapWrapper === DRAW_WRAPPER_TOKEN) {
                diag('[bitmap/init] Bitmap draw hooks already installed.');
                return;
            }

            const bitmapStates = new WeakMap();
            const FLUSH_DELAY_MS = 0;
            const GAP_MIN = 6;
            const GAP_RATIO = 0.65;
            const SPRITE_GLYPH_BASE_DELAY_MS = 180;
            const SPRITE_GLYPH_MAX_DELAY_MS = 650;
            const SPRITE_GLYPH_SINGLE_HOLD_MS = 900;
            const SPRITE_GLYPH_MAX_PENDING_MS = 5000;
            const perCharRegex = PER_CHAR_MARK ? new RegExp(PER_CHAR_MARK, 'g') : null;
            const VALID_CANVAS_TEXT_ALIGN = new Set(['left', 'right', 'center', 'start', 'end']);
            const hotDiagnosticLast = new Map();
            const HOT_DIAGNOSTIC_LIMIT = 500;
            const spriteTextParents = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
            let smallTextGlobalDepth = 0;
            let normalCharGlobalDepth = 0;

            const normalizeCanvasTextAlign = (align) => {
                const value = String(align || '').toLowerCase();
                return VALID_CANVAS_TEXT_ALIGN.has(value) ? value : 'left';
            };

            const isSmallTextScratchBitmap = (bitmap) => {
                try {
                    return !!(bitmap
                        && typeof Bitmap !== 'undefined'
                        && Bitmap
                        && Bitmap.drawSmallTextBitmap
                        && bitmap === Bitmap.drawSmallTextBitmap);
                } catch (_) {
                    return false;
                }
            };

            const hasDedicatedOwnerHook = (owner) => {
                if (!owner) return false;
                if (owner._trHasDedicatedTextHook) return true;
                const ctor = owner.constructor;
                return !!(ctor && ctor._trHasDedicatedTextHook);
            };

            const sanitizePerChar = (text) => {
                if (!text) return '';
                return perCharRegex ? String(text).replace(perCharRegex, '') : String(text);
            };

            const nextInstanceId = (() => {
                let counter = 0;
                return () => `bm-${Date.now().toString(36)}-${(++counter).toString(36)}`;
            })();

            const shouldTraceBitmapDiagnostics = () => !!(logger && typeof logger.shouldLog === 'function' && logger.shouldLog('trace'));
            const shouldCaptureBitmapCallSites = () => !!(
                shouldTraceBitmapDiagnostics()
                && settings
                && settings.debug
                && settings.debug.bitmapCallSites === true
            );

            const getHotDiagnosticIntervalMs = () => {
                const raw = settings && settings.debug ? Number(settings.debug.diagnosticRepeatMs) : NaN;
                return Number.isFinite(raw) && raw >= 0 ? raw : 1000;
            };

            const shouldLogHotDiagnostic = (key, intervalMs = getHotDiagnosticIntervalMs()) => {
                if (!shouldTraceBitmapDiagnostics()) return false;
                if (!key || intervalMs <= 0) return true;
                const now = Date.now();
                const last = hotDiagnosticLast.get(key);
                if (Number.isFinite(last) && now - last < intervalMs) {
                    return false;
                }
                hotDiagnosticLast.set(key, now);
                if (hotDiagnosticLast.size > HOT_DIAGNOSTIC_LIMIT) {
                    const cutoff = now - Math.max(1000, intervalMs * 5);
                    for (const [storedKey, storedAt] of hotDiagnosticLast) {
                        if (storedAt < cutoff || hotDiagnosticLast.size > HOT_DIAGNOSTIC_LIMIT) {
                            hotDiagnosticLast.delete(storedKey);
                        }
                        if (hotDiagnosticLast.size <= HOT_DIAGNOSTIC_LIMIT) break;
                    }
                }
                return true;
            };

            const diagHot = (key, messageFactory, intervalMs) => {
                if (!shouldLogHotDiagnostic(key, intervalMs)) return;
                try {
                    diag(typeof messageFactory === 'function' ? messageFactory() : messageFactory);
                } catch (_) {}
            };

            const captureBitmapCallSite = (force = false) => {
                if (!force && !shouldTraceBitmapDiagnostics()) return '';
                try {
                    const stack = new Error().stack;
                    if (!stack) return '';
                    const lines = String(stack)
                        .split('\n')
                        .slice(2)
                        .map((line) => String(line || '').trim())
                        .filter(Boolean);
                    const relevant = [];
                    for (const line of lines) {
                        if (/captureBitmapCallSite/.test(line)) continue;
                        if (/hooks\.js/.test(line) && /processBitmapDrawInvocation|installInvalidationHook|wrapped/.test(line)) continue;
                        if (/logger\.js/.test(line)) continue;
                        relevant.push(line.replace(/^at\s+/, ''));
                        if (relevant.length >= 2) break;
                    }
                    return relevant.join(' <- ');
                } catch (_) {
                    return '';
                }
            };

            const isSmallTextDrawActive = (bitmap) => {
                try {
                    return !!((bitmap && bitmap._trSmallTextDepth > 0) || smallTextGlobalDepth > 0);
                } catch (_) {
                    return smallTextGlobalDepth > 0;
                }
            };

            const isNormalCharacterDrawActive = (bitmap) => {
                try {
                    return !!((bitmap && bitmap._trNormalCharDepth > 0) || normalCharGlobalDepth > 0);
                } catch (_) {
                    return normalCharGlobalDepth > 0;
                }
            };

            const installSmallTextMarker = (target, methodName) => {
                try {
                    if (!target || typeof target[methodName] !== 'function') return false;
                    const current = target[methodName];
                    if (current.__trSmallTextWrapper === SMALL_TEXT_WRAPPER_TOKEN) return true;
                    const original = current;
                    const wrapped = function(...args) {
                        const targetBitmap = this && typeof Bitmap !== 'undefined' && this instanceof Bitmap
                            ? this
                            : (args && args[0] && typeof Bitmap !== 'undefined' && args[0] instanceof Bitmap ? args[0] : null);
                        if (targetBitmap) {
                            targetBitmap._trSmallTextDepth = (targetBitmap._trSmallTextDepth || 0) + 1;
                        } else {
                            smallTextGlobalDepth++;
                        }
                        try {
                            return original.apply(this, args);
                        } finally {
                            if (targetBitmap) {
                                targetBitmap._trSmallTextDepth = Math.max(0, (targetBitmap._trSmallTextDepth || 1) - 1);
                            } else {
                                smallTextGlobalDepth = Math.max(0, smallTextGlobalDepth - 1);
                            }
                        }
                    };
                    wrapped.__trSmallTextWrapper = SMALL_TEXT_WRAPPER_TOKEN;
                    wrapped.__trOriginal = original;
                    target[methodName] = wrapped;
                    return true;
                } catch (_) {
                    return false;
                }
            };

            const installNormalCharacterMarker = () => {
                try {
                    if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) return false;
                    const methodName = 'processNormalCharacter';
                    const current = Window_Base.prototype[methodName];
                    if (typeof current !== 'function') return false;
                    if (current.__trNormalCharWrapper === NORMAL_CHAR_WRAPPER_TOKEN) return true;
                    const original = current;
                    const wrapped = function(...args) {
                        const bitmap = this && this.contents ? this.contents : null;
                        if (bitmap) {
                            bitmap._trNormalCharDepth = (bitmap._trNormalCharDepth || 0) + 1;
                        } else {
                            normalCharGlobalDepth++;
                        }
                        try {
                            return original.apply(this, args);
                        } finally {
                            if (bitmap) {
                                bitmap._trNormalCharDepth = Math.max(0, (bitmap._trNormalCharDepth || 1) - 1);
                            } else {
                                normalCharGlobalDepth = Math.max(0, normalCharGlobalDepth - 1);
                            }
                        }
                    };
                    wrapped.__trNormalCharWrapper = NORMAL_CHAR_WRAPPER_TOKEN;
                    wrapped.__trOriginal = original;
                    Window_Base.prototype[methodName] = wrapped;
                    return true;
                } catch (_) {
                    return false;
                }
            };

            const rectFromDimensions = (x, y, width, height) => {
                const xNum = Number(x);
                const yNum = Number(y);
                const wNum = Number(width);
                const hNum = Number(height);
                const x1 = Number.isFinite(xNum) ? xNum : 0;
                const y1 = Number.isFinite(yNum) ? yNum : 0;
                const w = Number.isFinite(wNum) ? wNum : 0;
                const h = Number.isFinite(hNum) ? hNum : 0;
                const x2 = x1 + w;
                const y2 = y1 + h;
                return {
                    x1: Math.min(x1, x2),
                    y1: Math.min(y1, y2),
                    x2: Math.max(x1, x2),
                    y2: Math.max(y1, y2),
                };
            };

            const isValidRect = (rect) => rect
                && Number.isFinite(rect.x1)
                && Number.isFinite(rect.x2)
                && Number.isFinite(rect.y1)
                && Number.isFinite(rect.y2)
                && rect.x2 >= rect.x1
                && rect.y2 >= rect.y1;

            const rectHasArea = (rect) => isValidRect(rect) && rect.x2 > rect.x1 && rect.y2 > rect.y1;

            const formatRect = (rect) => {
                if (!rect || !isValidRect(rect)) return 'n/a';
                const width = Math.max(0, rect.x2 - rect.x1);
                const height = Math.max(0, rect.y2 - rect.y1);
                return `(${Math.round(rect.x1)},${Math.round(rect.y1)}) ${Math.round(width)}x${Math.round(height)}`;
            };

            const rectanglesOverlap = (a, b) => {
                if (!isValidRect(a) || !isValidRect(b)) return true;
                return !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
            };

            const rectanglesSimilar = (a, b, tolerance = 8) => {
                if (!isValidRect(a) || !isValidRect(b)) return false;
                return (
                    Math.abs(a.x1 - b.x1) <= tolerance
                    && Math.abs(a.x2 - b.x2) <= tolerance
                    && Math.abs(a.y1 - b.y1) <= tolerance
                    && Math.abs(a.y2 - b.y2) <= tolerance
                );
            };

            const deriveEntryRect = (entry) => {
                if (!entry) return null;
                if (entry.bounds && isValidRect(entry.bounds)) return entry.bounds;
                const width = Number.isFinite(entry.drawParams && entry.drawParams.maxWidth)
                    ? entry.drawParams.maxWidth
                    : Math.max(1, entry.visibleText ? entry.visibleText.length * 12 : 0);
                const height = Number.isFinite(entry.drawParams && entry.drawParams.lineHeight)
                    ? entry.drawParams.lineHeight
                    : 24;
                const x = entry.drawParams ? entry.drawParams.x : (entry.position ? entry.position.x : 0);
                const y = entry.drawParams ? entry.drawParams.y : (entry.position ? entry.position.y : 0);
                return rectFromDimensions(x, y, width, height);
            };

            const describeEntry = (entry) => {
                if (!entry) return 'entry=n/a';
                const parts = [
                    `key=${entry.key || 'n/a'}`,
                    `uuid=${entry.instanceId || 'unknown'}`,
                    `order=${entry.drawOrder || 0}`,
                    `status=${entry.translationStatus || 'unknown'}`,
                    `rect=${formatRect(deriveEntryRect(entry))}`,
                ];
                if (entry.isTranslatable === false) parts.push('skip');
                if (entry._trStale) parts.push('stale');
                return parts.join(' ');
            };

            const fragmentRect = (fragment) => {
                if (!fragment) return null;
                const lineHeight = Number.isFinite(fragment.lineHeight) && fragment.lineHeight > 0
                    ? fragment.lineHeight
                    : (fragment.drawState && Number.isFinite(fragment.drawState.fontSize)
                        ? fragment.drawState.fontSize
                        : 24);
                const w = Number.isFinite(fragment.width) && fragment.width > 0
                    ? fragment.width
                    : (Number.isFinite(fragment.maxWidth) ? fragment.maxWidth : lineHeight);
                return rectFromDimensions(
                    fragment.x,
                    fragment.y,
                    Math.max(1, w),
                    Math.max(1, lineHeight)
                );
            };

            const skipLikeCounter = (text) => {
                const trimmed = String(text || '').trim();
                if (!trimmed) return true;
                const nonSpace = trimmed.replace(/\s+/g, '');
                const cjkMatch = trimmed.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g);
                const cjkCount = cjkMatch ? cjkMatch.length : 0;
                const hasDigit = /\d/.test(trimmed);
                const onlyNumPunct = /^[0-9()\[\]\-+/*.,:;!?％%]+$/u.test(nonSpace);
                const comboMatch = /\d+\s*[\u3040-\u30FF\u4E00-\u9FFF]\s*\(\d+\)/u.test(trimmed);
                return (hasDigit && cjkCount <= 1 && nonSpace.length <= 10) || onlyNumPunct || comboMatch;
            };

            const textUnitCount = (text) => {
                try {
                    return Array.from(String(text || '')).length;
                } catch (_) {
                    return String(text || '').length;
                }
            };

            const firstPositiveNumber = (...values) => {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 0;
            };

            const fragmentVisibleText = (fragment) => sanitizePerChar(stripRpgmEscapes(
                fragment && (fragment.visibleText || fragment.rawText) ? (fragment.visibleText || fragment.rawText) : ''
            )).trim();

            const isStandaloneSpriteGlyphCandidate = (bitmap, fragment, owner) => {
                if (!bitmap || !fragment) return false;
                if (owner || hasDedicatedOwnerHook(owner) || bitmap._trHasDedicatedTextHook || bitmap._trMessageContents) {
                    return false;
                }
                const visible = fragmentVisibleText(fragment);
                if (!visible || /\s/u.test(visible) || textUnitCount(visible) !== 1) return false;

                const lineHeight = firstPositiveNumber(fragment.lineHeight, fragment.drawState && fragment.drawState.fontSize, bitmap.fontSize, 24);
                const bitmapWidth = Number(bitmap.width);
                const bitmapHeight = Number(bitmap.height);
                if (!Number.isFinite(bitmapWidth) || !Number.isFinite(bitmapHeight) || bitmapWidth <= 0 || bitmapHeight <= 0) {
                    return false;
                }

                const maxWidth = Math.max(96, lineHeight * 4);
                const maxHeight = Math.max(96, lineHeight * 3);
                if (bitmapWidth > maxWidth || bitmapHeight > maxHeight) return false;

                const textX = Number(fragment.x);
                const textY = Number(fragment.y);
                const offsetLimit = Math.max(8, lineHeight);
                if (Number.isFinite(textX) && Math.abs(textX) > offsetLimit) return false;
                if (Number.isFinite(textY) && Math.abs(textY) > offsetLimit) return false;
                return true;
            };

            const ensureBitmapState = (bitmap) => {
                if (!bitmap) return null;
                let state = bitmapStates.get(bitmap);
                if (!state) {
                    state = {
                        id: bitmap._trBitmapId || (bitmap._trBitmapId = Math.random().toString(36).substring(2, 11)),
                        fragments: [],
                        entries: new Map(),
                        flushTimer: null,
                        instanceMap: new Map(),
                        renderOps: [],
                        nativeTextOps: new Map(),
                        drawOrderCounter: 0,
                    };
                    bitmapStates.set(bitmap, state);
                } else if (!state.instanceMap) {
                    state.instanceMap = new Map();
                }
                if (!Array.isArray(state.renderOps)) {
                    state.renderOps = [];
                }
                if (!state.nativeTextOps || typeof state.nativeTextOps.set !== 'function') {
                    state.nativeTextOps = new Map();
                }
                if (!Number.isFinite(state.drawOrderCounter)) {
                    state.drawOrderCounter = 0;
                }
                return state;
            };

            const describeBitmap = (bitmap, ownerHint = null) => {
                if (!bitmap) return 'bitmap=n/a';
                const state = bitmapStates.get(bitmap);
                let owner = ownerHint || null;
                if (!owner && contentsOwners && typeof contentsOwners.get === 'function') {
                    try { owner = contentsOwners.get(bitmap); } catch (_) {}
                }
                const ownerType = owner && owner.constructor && owner.constructor.name
                    ? owner.constructor.name
                    : (bitmap.constructor && bitmap.constructor.name ? bitmap.constructor.name : 'Bitmap');
                const ownerId = owner && owner._uniqueId ? owner._uniqueId : null;
                const flags = [];
                if (bitmap._trMessageContents) flags.push('message');
                if (bitmap._trHasDedicatedTextHook) flags.push('dedicated');
                if (bitmap._trPreferWindowPipeline) flags.push(`windowDepth=${bitmap._trWindowPipelineDepth || 0}`);
                if (bitmap._trBitmapReplayDepth) flags.push(`replay=${bitmap._trBitmapReplayDepth}`);
                if (bitmap._trBitmapSkipDepth) flags.push(`skip=${bitmap._trBitmapSkipDepth}`);
                const parts = [
                    `bitmap=${state && state.id ? state.id : (bitmap._trBitmapId || 'unknown')}`,
                    `owner=${ownerType}${ownerId ? `#${ownerId}` : ''}`,
                    `size=${Number.isFinite(bitmap.width) ? bitmap.width : '?'}x${Number.isFinite(bitmap.height) ? bitmap.height : '?'}`,
                ];
                if (flags.length) parts.push(`flags=${flags.join(',')}`);
                return parts.join(' ');
            };

            const nextDrawOrder = (state) => {
                if (!state) return 0;
                state.drawOrderCounter = (state.drawOrderCounter || 0) + 1;
                return state.drawOrderCounter;
            };

            const estimateWidth = (bitmap, text, maxWidth) => {
                const cleaned = sanitizePerChar(text);
                if (!cleaned) return 0;
                let measured = 0;
                try {
                    if (bitmap && typeof bitmap.measureTextWidth === 'function') {
                        const w = bitmap.measureTextWidth(cleaned);
                        if (Number.isFinite(w)) measured = Math.ceil(w);
                    }
                } catch (_) { /* ignore */ }
                if (!measured) {
                    const fontSize = bitmap && Number.isFinite(bitmap.fontSize) ? bitmap.fontSize : 24;
                    measured = Math.ceil(cleaned.length * Math.max(6, fontSize * 0.6));
                }
                if (Number.isFinite(maxWidth) && maxWidth > 0 && maxWidth !== Infinity) {
                    return Math.max(1, Math.max(measured, Math.ceil(maxWidth)));
                }
                return measured;
            };

            const computeFontSignature = (drawState, bitmap) => {
                if (drawState && typeof drawState === 'object') {
                    return [
                        drawState.fontFace,
                        drawState.fontSize,
                        drawState.fontBold,
                        drawState.fontItalic,
                        drawState.textColor,
                        drawState.outlineColor,
                        drawState.outlineWidth
                    ].join('|');
                }
                if (bitmap) {
                    return [
                        bitmap.fontFace,
                        bitmap.fontSize,
                        bitmap.fontBold,
                        bitmap.fontItalic,
                        bitmap.textColor,
                        bitmap.outlineColor,
                        bitmap.outlineWidth
                    ].join('|');
                }
                return 'default';
            };

            const discardRenderOpsInRect = (state, rect) => {
                if (!state || !Array.isArray(state.renderOps) || state.renderOps.length === 0) return;
                if (!rect || !isValidRect(rect)) {
                    if (state.nativeTextOps && typeof state.nativeTextOps.clear === 'function') {
                        state.nativeTextOps.clear();
                    }
                    state.renderOps.length = 0;
                    return;
                }
                state.renderOps = state.renderOps.filter((op) => {
                    const keep = !op || !op.rect || !rectanglesOverlap(rect, op.rect);
                    if (!keep && op && op.nativeTextKey && state.nativeTextOps && state.nativeTextOps.get(op.nativeTextKey) === op) {
                        state.nativeTextOps.delete(op.nativeTextKey);
                    }
                    return keep;
                });
            };

            const removeNativeTextOpByKey = (state, key) => {
                if (!state || !state.nativeTextOps || !key) return null;
                const existing = state.nativeTextOps.get(key);
                if (!existing) return null;
                state.nativeTextOps.delete(key);
                if (Array.isArray(state.renderOps) && state.renderOps.length) {
                    state.renderOps = state.renderOps.filter((op) => op !== existing);
                }
                return existing;
            };

            const recordBitmapRenderOp = (bitmap, op) => {
                if (!bitmap || !op || !op.methodName) return null;
                const state = ensureBitmapState(bitmap);
                if (!state) return null;
                const rect = op.fullBitmap
                    ? rectFromDimensions(0, 0, bitmap.width, bitmap.height)
                    : op.rect;
                if (!rect || !isValidRect(rect)) return null;
                const record = {
                    methodName: op.methodName,
                    args: Array.isArray(op.args) ? op.args.slice() : [],
                    rect,
                    drawOrder: nextDrawOrder(state),
                    recordedAt: Date.now(),
                };
                state.renderOps.push(record);
                if (state.renderOps.length > 256) {
                    const removed = state.renderOps.splice(0, state.renderOps.length - 256);
                    if (removed.length && state.nativeTextOps) {
                        removed.forEach((item) => {
                            if (item && item.nativeTextKey && state.nativeTextOps.get(item.nativeTextKey) === item) {
                                state.nativeTextOps.delete(item.nativeTextKey);
                            }
                        });
                    }
                }
                return record;
            };

            const withBitmapReplay = (bitmap, fn) => {
                if (!bitmap || typeof fn !== 'function') return undefined;
                bitmap._trBitmapReplayDepth = (bitmap._trBitmapReplayDepth || 0) + 1;
                try {
                    return fn();
                } finally {
                    bitmap._trBitmapReplayDepth = Math.max(0, (bitmap._trBitmapReplayDepth || 1) - 1);
                }
            };

            const sanitizeBitmapDrawText = (text, methodName) => {
                if (typeof text !== 'string') return text;
                if (methodName === 'drawText' || methodName === 'drawTextS' || methodName === 'drawTextM') {
                    return stripRpgmEscapes(text);
                }
                return text;
            };

            const recordNativeBitmapTextOp = (entry) => {
                if (!entry || !entry.bitmap || !entry.key) return null;
                const state = ensureBitmapState(entry.bitmap);
                if (!state) return null;
                const rect = deriveEntryRect(entry);
                if (!rect || !isValidRect(rect)) return null;
                const drawOrder = nextDrawOrder(state);
                const args = [
                    entry.rawText,
                    entry.drawParams.x,
                    entry.drawParams.y,
                    entry.drawParams.maxWidth,
                    entry.drawParams.lineHeight,
                    entry.drawParams.align,
                ];
                const existing = state.nativeTextOps && state.nativeTextOps.get(entry.key);
                if (existing) {
                    existing.methodName = entry.methodName || 'drawText';
                    existing.args = args;
                    existing.rect = rect;
                    existing.drawState = entry.drawState;
                    existing.drawOrder = drawOrder;
                    existing.recordedAt = Date.now();
                    existing.nativeTextKey = entry.key;
                    existing.textPreview = entry.trimmedText || entry.rawText || '';
                    existing.ownerType = entry.ownerType || existing.ownerType;
                    existing.debugCallSite = entry.debugCallSite || existing.debugCallSite || '';
                    return existing;
                }
                const record = {
                    methodName: entry.methodName || 'drawText',
                    args,
                    rect,
                    drawState: entry.drawState,
                    drawOrder,
                    recordedAt: Date.now(),
                    nativeTextKey: entry.key,
                    textPreview: entry.trimmedText || entry.rawText || '',
                    ownerType: entry.ownerType || 'Bitmap',
                    debugCallSite: entry.debugCallSite || '',
                };
                state.renderOps.push(record);
                if (state.nativeTextOps) {
                    state.nativeTextOps.set(entry.key, record);
                }
                if (state.renderOps.length > 256) {
                    const removed = state.renderOps.splice(0, state.renderOps.length - 256);
                    if (removed.length && state.nativeTextOps) {
                        removed.forEach((item) => {
                            if (item && item.nativeTextKey && state.nativeTextOps.get(item.nativeTextKey) === item) {
                                state.nativeTextOps.delete(item.nativeTextKey);
                            }
                        });
                    }
                }
                return record;
            };

            const drawBitmapTextValue = (bitmap, entry, text) => {
                if (!bitmap || !entry || typeof text !== 'string' || !text) return;
                try { applyBitmapDrawState(bitmap, entry.drawState); } catch (_) {}
                const drawMethodName = entry.methodName && typeof bitmap[entry.methodName] === 'function'
                    ? entry.methodName
                    : 'drawText';
                const drawFn = bitmap[drawMethodName] || bitmap.drawText;
                if (typeof drawFn !== 'function') return;
                const safeText = sanitizeBitmapDrawText(text, drawMethodName);
                drawFn.call(
                    bitmap,
                    safeText,
                    entry.drawParams.x,
                    entry.drawParams.y,
                    entry.drawParams.maxWidth,
                    entry.drawParams.lineHeight,
                    entry.drawParams.align
                );
            };

            const replayBitmapEntry = (bitmap, entry) => {
                if (!bitmap || !entry || entry._trStale) return;
                const text = entry.translationStatus === 'completed' && entry.translatedText
                    ? entry.translatedText
                    : entry.rawText;
                drawBitmapTextValue(bitmap, entry, text);
            };

            const replayBitmapRenderOp = (bitmap, op) => {
                if (!bitmap || !op || !op.methodName) return;
                switch (op.methodName) {
                case 'drawText':
                case 'drawTextS':
                case 'drawTextM': {
                    const drawMethodName = typeof bitmap[op.methodName] === 'function' ? op.methodName : 'drawText';
                    const drawFn = bitmap[drawMethodName] || bitmap.drawText;
                    if (typeof drawFn !== 'function') break;
                    try { applyBitmapDrawState(bitmap, op.drawState); } catch (_) {}
                    const drawArgs = Array.isArray(op.args) ? op.args.slice() : [];
                    if (drawArgs.length > 0) {
                        drawArgs[0] = sanitizeBitmapDrawText(drawArgs[0], drawMethodName);
                    }
                    drawFn.call(bitmap, ...drawArgs);
                    break;
                }
                case 'fillRect':
                    if (typeof bitmap.fillRect === 'function') bitmap.fillRect(...op.args);
                    break;
                case 'gradientFillRect':
                    if (typeof bitmap.gradientFillRect === 'function') bitmap.gradientFillRect(...op.args);
                    break;
                case 'fillAll':
                    if (typeof bitmap.fillAll === 'function') bitmap.fillAll(...op.args);
                    break;
                case 'blt':
                    if (typeof bitmap.blt === 'function') bitmap.blt(...op.args);
                    break;
                default:
                    break;
                }
            };

            const collectReplayItems = (state, rect, currentEntry, relation) => {
                if (!state || !rect || !isValidRect(rect) || typeof relation !== 'function') return [];
                const items = [];
                if (Array.isArray(state.renderOps)) {
                    state.renderOps.forEach((op) => {
                        if (!op || !op.rect || !rectanglesOverlap(rect, op.rect)) return;
                        if (!relation(op.drawOrder || 0)) return;
                        items.push({ type: 'renderOp', drawOrder: op.drawOrder || 0, op });
                    });
                }
                if (state.entries && typeof state.entries.forEach === 'function') {
                    state.entries.forEach((entry) => {
                        if (!entry || entry === currentEntry || entry._trStale) return;
                        const entryRect = deriveEntryRect(entry);
                        if (!entryRect || !rectanglesOverlap(rect, entryRect)) return;
                        if (!relation(entry.drawOrder || 0)) return;
                        items.push({ type: 'text', drawOrder: entry.drawOrder || 0, entry });
                    });
                }
                items.sort((a, b) => (a.drawOrder || 0) - (b.drawOrder || 0));
                return items;
            };

            const summarizeReplayItems = (items, limit = 6) => {
                if (!Array.isArray(items) || items.length === 0) return 'none';
                const rendered = items.slice(0, limit).map((item) => {
                    if (!item) return 'null';
                    if (item.type === 'renderOp') {
                        const previewText = item.op && item.op.textPreview ? `:"${preview(item.op.textPreview, 20)}"` : '';
                        return `op:${item.op && item.op.methodName ? item.op.methodName : 'unknown'}#${item.drawOrder || 0}@${formatRect(item.op && item.op.rect)}${previewText}`;
                    }
                    const entry = item.entry;
                    const text = entry && (entry.trimmedText || entry.rawText) ? preview(entry.trimmedText || entry.rawText, 20) : '';
                    const status = entry && entry.translationStatus ? entry.translationStatus : 'unknown';
                    return `text:${item.drawOrder || 0}:${status}:"${text}"`;
                });
                if (items.length > limit) {
                    rendered.push(`+${items.length - limit} more`);
                }
                return rendered.join(' | ');
            };

            const replayBitmapItems = (bitmap, items) => {
                if (!bitmap || !Array.isArray(items) || items.length === 0) return;
                items.forEach((item) => {
                    if (!item) return;
                    if (item.type === 'renderOp') {
                        replayBitmapRenderOp(bitmap, item.op);
                    } else if (item.type === 'text') {
                        replayBitmapEntry(bitmap, item.entry);
                    }
                });
            };

            const pushInvalidationGuard = (bitmap, guard) => {
                if (!bitmap || !guard || !guard.rect) return guard;
                try {
                    if (!Array.isArray(bitmap._trInvalidationGuards)) {
                        bitmap._trInvalidationGuards = [];
                    }
                    bitmap._trInvalidationGuards.push(guard);
                } catch (_) {}
                return guard;
            };

            const popInvalidationGuard = (bitmap, guard) => {
                if (!bitmap || !guard || !Array.isArray(bitmap._trInvalidationGuards)) return;
                const guards = bitmap._trInvalidationGuards;
                const idx = guards.lastIndexOf(guard);
                if (idx >= 0) {
                    guards.splice(idx, 1);
                }
            };

            const consumeInvalidationGuard = (bitmap, rect, reason) => {
                if (!bitmap || !rect || !Array.isArray(bitmap._trInvalidationGuards)) return null;
                const guards = bitmap._trInvalidationGuards;
                for (let i = guards.length - 1; i >= 0; i--) {
                    const guard = guards[i];
                    if (!guard) continue;
                    if (guard.method && guard.method !== reason) continue;
                    const guardRect = guard.rect;
                    if (guardRect && rectanglesOverlap(guardRect, rect)) {
                        guards.splice(i, 1);
                        return guard;
                    }
                }
                return null;
            };

            const calculateClearRect = (bitmap, entry, outlinePadding) => {
                const bounds = entry && entry.bounds;
                if (!bitmap || !bounds) return null;
                const fontSize = entry.drawState && Number.isFinite(entry.drawState.fontSize)
                    ? entry.drawState.fontSize
                    : (entry.drawParams && Number.isFinite(entry.drawParams.lineHeight)
                        ? entry.drawParams.lineHeight
                        : 24);
                const topPad = Math.min(Math.max(0, Math.ceil(fontSize * 0.08)), outlinePadding);
                const bottomPad = Math.max(outlinePadding, Math.ceil(fontSize * 0.25));
                const width = Math.max(0, Math.ceil((bounds.x2 - bounds.x1) + outlinePadding * 2));
                const height = Math.max(0, Math.ceil((bounds.y2 - bounds.y1) + topPad + bottomPad));
                const clearX = Math.max(0, Math.floor(bounds.x1 - outlinePadding));
                const clearY = Math.max(0, Math.floor(bounds.y1 - topPad));
                return {
                    x: clearX,
                    y: clearY,
                    width: Math.min(Math.max(0, bitmap.width - clearX), width),
                    height: Math.min(Math.max(0, bitmap.height - clearY), height),
                    topPad,
                    bottomPad,
                };
            };

            const markEntryStale = (state, entry, reason, details = null) => {
                if (!state || !entry || entry._trStale) return;
                entry._trStale = true;
                entry.canceledReason = reason;
                entry.canceledAt = Date.now();
                if (entry.key && state.entries && state.entries.get(entry.key) === entry) {
                    state.entries.delete(entry.key);
                } else if (state.entries) {
                    try {
                        state.entries.forEach((value, key) => {
                            if (value === entry) state.entries.delete(key);
                        });
                    } catch (_) {}
                }
                if (state.instanceMap && entry.instanceId) {
                    state.instanceMap.delete(entry.instanceId);
                }
                const detailParts = [
                    describeBitmap(entry.bitmap),
                    `reason=${reason}`,
                    describeEntry(entry),
                    `text="${preview(entry.trimmedText || entry.rawText || '')}"`,
                ];
                if (details && details.rect) {
                    detailParts.push(`target=${formatRect(details.rect)}`);
                }
                if (details && details.activeEntry) {
                    detailParts.push(`active=${details.activeEntry.instanceId || 'unknown'}`);
                }
                if (entry.debugCallSite) {
                    detailParts.push(`site=${entry.debugCallSite}`);
                }
                diag(`[bitmap/cancel] ${detailParts.join(' ')}`);
            };

            const discardFragmentsInRect = (state, rect, reason, skipEntry = null) => {
                if (!state || !Array.isArray(state.fragments) || state.fragments.length === 0) return;
                if (!rect || !isValidRect(rect)) {
                    const removed = state.fragments.length;
                    state.fragments.length = 0;
                    if (removed) {
                        diag(`[bitmap/invalidate] reason=${reason} fragments_cleared=${removed}`);
                    }
                    return;
                }
                const before = state.fragments.length;
                state.fragments = state.fragments.filter((fragment) => {
                    if (!fragment) return false;
                    const fragRect = fragmentRect(fragment);
                    if (skipEntry && skipEntry.bounds && fragment.ownerType === skipEntry.ownerType) {
                        if (fragRect && rectanglesOverlap(fragRect, skipEntry.bounds)) {
                            return true;
                        }
                    }
                    return !fragRect || !rectanglesOverlap(rect, fragRect);
                });
                const removed = before - state.fragments.length;
                if (removed > 0) {
                    diag(`[bitmap/invalidate] reason=${reason} fragments_removed=${removed}`);
                }
            };

            const invalidateEntriesInRect = (bitmap, rect, reason, skipEntry = null) => {
                const state = bitmapStates.get(bitmap);
                if (!state || !state.entries || state.entries.size === 0) return 0;
                let removed = 0;
                const targetRect = rect && isValidRect(rect) ? rect : null;
                const entries = Array.from(state.entries.values());
                for (const entry of entries) {
                    if (!entry || entry === skipEntry) continue;
                    const entryRect = deriveEntryRect(entry);
                    if (!targetRect || !entryRect || rectanglesOverlap(targetRect, entryRect)) {
                        markEntryStale(state, entry, `${reason}-rect`, {
                            rect: targetRect,
                            activeEntry: skipEntry || null,
                        });
                        removed++;
                    }
                }
                if (removed) {
                    discardFragmentsInRect(state, targetRect, reason, skipEntry);
                }
                return removed;
            };

            const deriveWindowEntryRect = (entry) => {
                if (!entry) return null;
                if (entry.bounds && isValidRect(entry.bounds)) return entry.bounds;
                const x = entry.position && Number.isFinite(Number(entry.position.x))
                    ? Number(entry.position.x)
                    : 0;
                const y = entry.position && Number.isFinite(Number(entry.position.y))
                    ? Number(entry.position.y)
                    : 0;
                const params = entry.originalParams || {};
                const width = Number.isFinite(Number(params.maxWidth)) && Number(params.maxWidth) > 0
                    ? Number(params.maxWidth)
                    : Math.max(1, String(entry.visibleText || entry.convertedText || entry.rawText || '').length * 12);
                const height = Number.isFinite(Number(params.lineHeight)) && Number(params.lineHeight) > 0
                    ? Number(params.lineHeight)
                    : 24;
                return rectFromDimensions(x, y, width, height);
            };

            const invalidateWindowEntriesInRect = (bitmap, rect, reason, options = {}) => {
                if (!bitmap || !contentsOwners || !windowRegistry) return 0;
                if (bitmap._trWindowRedrawClearDepth && bitmap._trWindowRedrawClearDepth > 0) return 0;
                if (options && options.skipEntryInvalidation) return 0;

                let owner = null;
                try {
                    if (contentsOwners && typeof contentsOwners.get === 'function') {
                        owner = contentsOwners.get(bitmap);
                    }
                } catch (_) {}
                if (!owner) return 0;

                let data = null;
                try {
                    data = windowRegistry && typeof windowRegistry.get === 'function'
                        ? windowRegistry.get(owner)
                        : null;
                } catch (_) {}
                if (!data || !data.texts || typeof data.texts.forEach !== 'function') return 0;

                const targetRect = rect && isValidRect(rect) ? rect : null;
                const removed = [];
                try {
                    data.texts.forEach((entry, key) => {
                        if (!entry) return;
                        const entryRect = deriveWindowEntryRect(entry);
                        if (!targetRect || !entryRect || rectanglesOverlap(targetRect, entryRect)) {
                            removed.push({ key, entry });
                        }
                    });
                } catch (_) {}

                if (!removed.length) return 0;

                removed.forEach(({ key, entry }) => {
                    try {
                        if (entry) {
                            entry._trStale = true;
                            if (entry.translationStatus === 'completed') {
                                entry.translationStatus = 'stale';
                            }
                            entry.canceledReason = `${reason}-contents`;
                            entry.canceledAt = Date.now();
                        }
                    } catch (_) {}
                    try { data.texts.delete(key); } catch (_) {}
                    try {
                        if (data.pendingRedraws && typeof data.pendingRedraws.delete === 'function') {
                            data.pendingRedraws.delete(key);
                        }
                    } catch (_) {}
                });

                try {
                    data.contentsRevision = (data.contentsRevision || 0) + 1;
                    if (!targetRect && data.pendingRedraws && typeof data.pendingRedraws.clear === 'function') {
                        data.pendingRedraws.clear();
                    }
                    if (!targetRect && data.recentlyRedrawn && typeof data.recentlyRedrawn.clear === 'function') {
                        data.recentlyRedrawn.clear();
                    }
                } catch (_) {}

                const ownerType = owner && owner.constructor && owner.constructor.name
                    ? owner.constructor.name
                    : 'Window';
                const rectLabel = targetRect ? formatRect(targetRect) : 'FULL';
                diagHot(
                    `window/invalidate|${ownerType}|${reason}|${rectLabel}|${removed.length}`,
                    () => `[window/invalidate] owner=${ownerType} reason=${reason} rect=${rectLabel} removed=${removed.length}`
                );
                return removed.length;
            };

            const handleBitmapInvalidation = (bitmap, rect, reason, options = {}) => {
                if (!bitmap) return;
                const skipEntry = bitmap._trActiveRedrawEntry || null;
                const state = bitmapStates.get(bitmap);

                try {
                    if (state && Array.isArray(state.fragments) && state.fragments.length > 0) {
                        if (rect && isValidRect(rect)) {
                            flushAggregatedLines(bitmap, `pre-${reason}`, rect);
                        } else {
                            flushAggregatedLines(bitmap, `pre-${reason}`);
                        }
                    }
                } catch (_) {}

                if (skipEntry && rect && skipEntry.bounds && rectanglesOverlap(rect, skipEntry.bounds)) {
                    const similar = rectanglesSimilar(rect, skipEntry.bounds, 12);
                    if (similar) {
                        if (state) {
                            discardFragmentsInRect(state, rect, `${reason}-self`, skipEntry);
                        }
                        diag(`[bitmap/invalidate-skip] ${describeBitmap(bitmap)} reason=${reason} rect=${formatRect(rect)} uuid=${skipEntry.instanceId || 'unknown'} treated_as_self_clear`);
                        return;
                    }
                }

                let removed = 0;
                if (!options.skipEntryInvalidation) {
                    removed = invalidateEntriesInRect(bitmap, rect, reason, skipEntry);
                } else if (state && Array.isArray(state.fragments)) {
                    discardFragmentsInRect(state, rect, `${reason}-skip`, skipEntry);
                }
                if (removed) {
                    let ownerType = 'Bitmap';
                    try {
                        if (skipEntry && skipEntry.ownerType) {
                            ownerType = skipEntry.ownerType;
                        } else if (contentsOwners && typeof contentsOwners.get === 'function') {
                            const owner = contentsOwners.get(bitmap);
                            if (owner && owner.constructor && owner.constructor.name) {
                                ownerType = owner.constructor.name;
                            }
                        }
                    } catch (_) {}
                    telemetry.logDraw('bitmap_invalidate', reason, (rect && rect.x1) || 0, (rect && rect.y1) || 0, {
                        ownerType,
                        removed,
                    });
                } else if (state) {
                    discardFragmentsInRect(state, rect, reason, skipEntry);
                }
            };

            const installInvalidationHook = (methodName, rectResolver) => {
                const original = Bitmap.prototype[methodName];
                if (typeof original !== 'function') return;
                if (original.__trInvalidationWrapped) return;
                const wrapped = function(...args) {
                    let rect = null;
                    let extraOptions = {};
                    const callSite = shouldCaptureBitmapCallSites() && (methodName === 'clearRect' || methodName === 'clear' || methodName === 'resize')
                        ? captureBitmapCallSite()
                        : '';
                    try {
                        const resolved = rectResolver.call(this, args);
                        if (resolved && typeof resolved === 'object' && ('rect' in resolved || 'options' in resolved)) {
                            rect = resolved.rect !== undefined ? resolved.rect : null;
                            extraOptions = resolved.options || {};
                        } else {
                            rect = resolved;
                        }
                    } catch (_) {}
                    const result = original.apply(this, args);
                    if (isSmallTextScratchBitmap(this)) {
                        return result;
                    }
                    if (this && this._trBitmapReplayDepth && this._trBitmapReplayDepth > 0) {
                        if (shouldTraceBitmapDiagnostics() && rect !== false) {
                            const replayRect = rect && rect !== 'FULL' && isValidRect(rect) ? rect : null;
                            diag(`[bitmap/invalidate-bypass] ${describeBitmap(this)} reason=${methodName} rect=${replayRect ? formatRect(replayRect) : (rect === 'FULL' ? 'FULL' : 'n/a')} replayDepth=${this._trBitmapReplayDepth}${callSite ? ` site=${callSite}` : ''}`);
                        }
                        return result;
                    }
                    if (rect !== false) {
                        let resolvedRect = null;
                        if (rect === 'FULL') {
                            resolvedRect = null;
                        } else {
                            resolvedRect = rect;
                        }
                        if (shouldTraceBitmapDiagnostics()) {
                            const state = bitmapStates.get(this);
                            const skipEntry = this && this._trActiveRedrawEntry ? this._trActiveRedrawEntry : null;
                            diag(`[bitmap/invalidate-start] ${describeBitmap(this)} reason=${methodName} rect=${resolvedRect && isValidRect(resolvedRect) ? formatRect(resolvedRect) : (rect === 'FULL' ? 'FULL' : 'n/a')} entries=${state && state.entries ? state.entries.size : 0} fragments=${state && Array.isArray(state.fragments) ? state.fragments.length : 0} renderOps=${state && Array.isArray(state.renderOps) ? state.renderOps.length : 0}${skipEntry ? ` active=${skipEntry.instanceId || 'unknown'}` : ''}${callSite ? ` site=${callSite}` : ''}`);
                        }
                        if (extraOptions && extraOptions.clearRenderOps) {
                            const state = bitmapStates.get(this);
                            if (state) {
                                discardRenderOpsInRect(
                                    state,
                                    extraOptions.clearRenderOps === 'all'
                                        ? null
                                        : (resolvedRect && isValidRect(resolvedRect) ? resolvedRect : null)
                                );
                            }
                        }
                        invalidateWindowEntriesInRect(
                            this,
                            resolvedRect && isValidRect(resolvedRect) ? resolvedRect : null,
                            methodName,
                            extraOptions
                        );
                        const guard = resolvedRect ? consumeInvalidationGuard(this, resolvedRect, methodName) : null;
                        if (guard) {
                            diag(`[bitmap/invalidate-guard] ${describeBitmap(this)} reason=${methodName} rect=${formatRect(resolvedRect)} uuid=${guard.entry && guard.entry.instanceId ? guard.entry.instanceId : 'unknown'}${callSite ? ` site=${callSite}` : ''}`);
                            const state = bitmapStates.get(this);
                            if (state) {
                                discardFragmentsInRect(state, resolvedRect, `${methodName}-guard`, guard.entry || null);
                            }
                        } else {
                            handleBitmapInvalidation(this, resolvedRect && isValidRect(resolvedRect) ? resolvedRect : null, methodName, extraOptions);
                        }
                        if (extraOptions && extraOptions.recordOp) {
                            const op = Object.assign({}, extraOptions.recordOp);
                            if (!op.rect && resolvedRect) {
                                op.rect = resolvedRect;
                            }
                            recordBitmapRenderOp(this, op);
                        }
                    }
                    return result;
                };
                wrapped.__trInvalidationWrapped = true;
                Bitmap.prototype[methodName] = wrapped;
                diag(`[bitmap/invalidate-hook] Installed for ${methodName}`);
            };

            const rectOrFalse = (rect) => (rectHasArea(rect) ? rect : false);

            installInvalidationHook('clearRect', function(args) {
                const [x, y, w, h] = args;
                return {
                    rect: rectOrFalse(rectFromDimensions(x, y, w, h)),
                    options: { clearRenderOps: 'rect' },
                };
            });

            installInvalidationHook('clear', function() {
                return {
                    rect: 'FULL',
                    options: { clearRenderOps: 'all' },
                };
            });

            installInvalidationHook('fillRect', function(args) {
                const [x, y, w, h, color] = args;
                return {
                    rect: rectOrFalse(rectFromDimensions(x, y, w, h)),
                    options: {
                        recordOp: {
                            methodName: 'fillRect',
                            args: [x, y, w, h, color],
                        },
                    },
                };
            });

            installInvalidationHook('gradientFillRect', function(args) {
                const [x, y, w, h, color1, color2, vertical] = args;
                return {
                    rect: rectOrFalse(rectFromDimensions(x, y, w, h)),
                    options: {
                        recordOp: {
                            methodName: 'gradientFillRect',
                            args: [x, y, w, h, color1, color2, vertical],
                        },
                    },
                };
            });

            installInvalidationHook('fillAll', function(args) {
                return {
                    rect: 'FULL',
                    options: {
                        clearRenderOps: 'all',
                    },
                };
            });

            installInvalidationHook('resize', function() {
                return {
                    rect: 'FULL',
                    options: { clearRenderOps: 'all' },
                };
            });

            installInvalidationHook('blt', function(args) {
                const [source, , , sw, sh, dx, dy, dw, dh] = args;
                const width = Number.isFinite(Number(dw)) ? dw : sw;
                const height = Number.isFinite(Number(dh)) ? dh : sh;
                const recordOp = isSmallTextScratchBitmap(source)
                    ? null
                    : {
                        methodName: 'blt',
                        args: Array.isArray(args) ? args.slice() : [],
                    };
                return {
                    rect: rectOrFalse(rectFromDimensions(dx, dy, width, height)),
                    options: {
                        skipEntryInvalidation: true,
                        recordOp,
                    },
                };
            });

            const flushAggregatedLines = (bitmap, reason = 'manual', targetRect = null) => {
                const state = bitmapStates.get(bitmap);
                if (!state || !Array.isArray(state.fragments) || state.fragments.length === 0) return;
                let fragments;
                if (targetRect && isValidRect(targetRect)) {
                    const remaining = [];
                    const selected = [];
                    for (const fragment of state.fragments) {
                        const fragRect = fragmentRect(fragment);
                        if (fragRect && rectanglesOverlap(fragRect, targetRect)) {
                            selected.push(fragment);
                        } else {
                            remaining.push(fragment);
                        }
                    }
                    if (!selected.length) return;
                    fragments = selected;
                    state.fragments = remaining;
                    diag(`[bitmap/flush] reason=${reason} fragments=${fragments.length} (targeted)`);
                } else {
                    fragments = state.fragments.splice(0, state.fragments.length);
                    diag(`[bitmap/flush] reason=${reason} fragments=${fragments.length}`);
                }

                const lines = new Map();
                for (const fragment of fragments) {
                    const yKey = `${Math.round(fragment.y)}:${Math.round(fragment.lineHeight)}`;
                    if (!lines.has(yKey)) lines.set(yKey, []);
                    lines.get(yKey).push(fragment);
                }

                const now = Date.now();
                const entries = [];
                lines.forEach((lineFragments) => {
                    lineFragments.sort((a, b) => a.x - b.x);
                    let currentBlock = [];
                    let lastFragment = null;
                    const groupList = [];
                    for (const frag of lineFragments) {
                        if (!lastFragment) {
                            currentBlock = [frag];
                            groupList.push(currentBlock);
                            lastFragment = frag;
                            continue;
                        }
                        const gap = frag.x - (lastFragment.x + lastFragment.width);
                        const gapLimit = Math.max(GAP_MIN, Math.ceil((frag.lineHeight || lastFragment.lineHeight || 24) * GAP_RATIO));
                        const sameFont = lastFragment.fontSignature === frag.fontSignature;
                        const sameAlign = lastFragment.align === frag.align;
                        if (gap > gapLimit || !sameFont || !sameAlign) {
                            currentBlock = [frag];
                            groupList.push(currentBlock);
                        } else {
                            currentBlock.push(frag);
                        }
                        lastFragment = frag;
                    }

                    for (const block of groupList) {
                        if (!block.length) continue;
                        const bounds = block.reduce((acc, frag) => {
                            const minX = Math.min(acc.x1, frag.x);
                            const minY = Math.min(acc.y1, frag.y);
                            const maxX = Math.max(acc.x2, frag.x + frag.width);
                            const maxY = Math.max(acc.y2, frag.y + frag.lineHeight);
                            return {
                                x1: minX,
                                y1: minY,
                                x2: maxX,
                                y2: maxY,
                            };
                        }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
                        if (!Number.isFinite(bounds.x1) || !Number.isFinite(bounds.y1)) continue;

                        const combinedRaw = block.map(f => f.rawText).join('');
                        const combinedVisible = sanitizePerChar(block.map(f => f.visibleText).join(''));
                        const converted = stripRpgmEscapes(combinedRaw || '');
                        const trimmed = sanitizePerChar(converted).trim();
                        if (!trimmed) {
                            diag(`[bitmap/skip] ${describeBitmap(bitmap)} empty trimmed text after combination.`);
                            continue;
                        }
                        const ownerType = block[0].ownerType;
                        const align = block.length === 1 ? block[0].align : 'left';
                        const drawX = block.length === 1 ? block[0].x : bounds.x1;
                        const maxWidth = Math.max(bounds.x2 - bounds.x1, block.reduce((m, f) => Math.max(m, f.maxWidth || 0), 0));
                        const lineHeight = Math.max(...block.map(f => f.lineHeight || 0), 1);
                        const preferredFragment = block.reduce((best, frag) => {
                            if (!frag) return best;
                            const widthScore = Math.max(1, Number.isFinite(frag.width) ? frag.width : frag.maxWidth || 0);
                            const textLen = sanitizePerChar(frag.visibleText || frag.rawText || '').length;
                            if (!best) {
                                return { frag, score: widthScore, len: textLen };
                            }
                            if (widthScore > best.score) {
                                return { frag, score: widthScore, len: textLen };
                            }
                            if (widthScore === best.score && textLen > best.len) {
                                return { frag, score: widthScore, len: textLen };
                            }
                            return best;
                        }, null);
                        const dominantFragment = preferredFragment && preferredFragment.frag ? preferredFragment.frag : block[block.length - 1];
                        const drawState = dominantFragment && dominantFragment.drawState ? dominantFragment.drawState : block[0].drawState;
                        const methodName = dominantFragment && dominantFragment.methodName
                            ? dominantFragment.methodName
                            : (block[0] && block[0].methodName ? block[0].methodName : 'drawText');

                        const entry = {
                            bitmap,
                            key: `${state.id}:${Math.round(drawX)}:${Math.round(bounds.y1)}:${Math.round(maxWidth)}:${align}:${ownerType}`,
                            detectedAt: now,
                            ownerType,
                            rawText: combinedRaw,
                            visibleText: combinedVisible,
                            convertedText: converted,
                            trimmedText: trimmed,
                            drawParams: {
                                x: drawX,
                                y: bounds.y1,
                                maxWidth: Math.max(1, maxWidth),
                                lineHeight: Math.max(1, lineHeight),
                                align,
                            },
                            bounds,
                            drawState,
                            translationStatus: 'pending',
                            fragments: block,
                            position: { x: drawX, y: bounds.y1 },
                            methodName,
                            spriteGlyphCandidate: block.length === 1 && !!block[0].standaloneSpriteGlyphCandidate,
                            debugCallSite: dominantFragment && dominantFragment.debugCallSite
                                ? dominantFragment.debugCallSite
                                : (block[0] && block[0].debugCallSite ? block[0].debugCallSite : ''),
                        };
                        entries.push(entry);
                    }
                });

                const activationQueue = [];
                for (const entry of entries) {
                    registerBitmapEntry(entry, activationQueue);
                }
                for (const entry of activationQueue) {
                    activateBitmapEntryTranslation(entry);
                }
            };

            const scheduleFlush = (bitmap) => {
                const state = bitmapStates.get(bitmap);
                if (!state) return;
                if (state.flushTimer) return;
                state.flushTimer = setTimeout(() => {
                    state.flushTimer = null;
                    try { flushAggregatedLines(bitmap, 'timer'); } catch (err) {
                        logger.warn('[bitmap/flush-error]', err);
                    }
                }, FLUSH_DELAY_MS);
            };

            const nextSpriteRunId = (() => {
                let counter = 0;
                return () => `spr-${Date.now().toString(36)}-${(++counter).toString(36)}`;
            })();

            const describeSprite = (sprite) => {
                if (!sprite) return 'sprite=n/a';
                const ctor = sprite.constructor && sprite.constructor.name ? sprite.constructor.name : 'Sprite';
                const childCount = sprite.children && Number.isFinite(sprite.children.length) ? sprite.children.length : 0;
                return `${ctor} children=${childCount}`;
            };

            const ensureSpriteTextParentState = (parent) => {
                if (!parent || !spriteTextParents) return null;
                let state = spriteTextParents.get(parent);
                if (!state) {
                    state = {
                        glyphs: [],
                        flushTimer: null,
                        flushDueAt: 0,
                        lastGlyphAt: 0,
                        maxInterGlyphMs: 0,
                    };
                    spriteTextParents.set(parent, state);
                }
                if (!Array.isArray(state.glyphs)) state.glyphs = [];
                return state;
            };

            const resolveSpriteTextDelay = (state) => {
                const interGlyphDelay = state && Number.isFinite(state.maxInterGlyphMs)
                    ? Math.ceil(state.maxInterGlyphMs * 2 + 40)
                    : 0;
                return Math.min(
                    SPRITE_GLYPH_MAX_DELAY_MS,
                    Math.max(SPRITE_GLYPH_BASE_DELAY_MS, interGlyphDelay)
                );
            };

            const removePendingBitmapFragment = (bitmap, fragment) => {
                const state = bitmapStates.get(bitmap);
                if (!state || !Array.isArray(state.fragments) || !fragment) return false;
                const before = state.fragments.length;
                state.fragments = state.fragments.filter((item) => item !== fragment);
                return state.fragments.length !== before;
            };

            const glyphLayout = (glyph) => {
                if (!glyph || !glyph.sprite || !glyph.fragment) return null;
                const sprite = glyph.sprite;
                const fragment = glyph.fragment;
                const bitmap = glyph.bitmap || sprite.bitmap || fragment.bitmap || null;
                const bitmapWidth = bitmap && Number.isFinite(Number(bitmap.width)) ? Number(bitmap.width) : 0;
                const bitmapHeight = bitmap && Number.isFinite(Number(bitmap.height)) ? Number(bitmap.height) : 0;
                const anchorX = sprite.anchor && Number.isFinite(Number(sprite.anchor.x)) ? Number(sprite.anchor.x) : 0;
                const anchorY = sprite.anchor && Number.isFinite(Number(sprite.anchor.y)) ? Number(sprite.anchor.y) : 0;
                const width = firstPositiveNumber(sprite.dw, fragment.width, fragment.maxWidth, bitmapWidth, fragment.lineHeight, 1);
                const height = firstPositiveNumber(bitmapHeight, fragment.lineHeight, fragment.drawState && fragment.drawState.fontSize, 24);
                const x = (Number.isFinite(Number(sprite.x)) ? Number(sprite.x) : 0) - anchorX * bitmapWidth;
                const y = (Number.isFinite(Number(sprite.y)) ? Number(sprite.y) : 0) - anchorY * bitmapHeight;
                return {
                    x,
                    y,
                    width,
                    height,
                    lineHeight: firstPositiveNumber(fragment.lineHeight, height),
                    fontSignature: fragment.fontSignature || computeFontSignature(fragment.drawState, bitmap),
                    visibleText: fragmentVisibleText(fragment),
                };
            };

            const isGlyphStillAttached = (glyph) => {
                if (!glyph || !glyph.sprite || !glyph.parent) return false;
                if (glyph.sprite._destroyed || glyph.parent._destroyed) return false;
                if (glyph.sprite.parent && glyph.sprite.parent !== glyph.parent) return false;
                if (!glyph.sprite.parent) return false;
                try {
                    return glyph.sprite.bitmap === glyph.bitmap;
                } catch (_) {
                    return true;
                }
            };

            const markSpriteTextRunStale = (run, reason) => {
                if (!run || run._trStale) return;
                run._trStale = true;
                run.canceledReason = reason;
                run.canceledAt = Date.now();
                diag(`[sprite-text/cancel] parent=${describeSprite(run.parent)} reason=${reason} id=${run.id || 'unknown'} text="${preview(run.trimmedText || '')}"`);
            };

            const isSpriteTextRunAlive = (run) => {
                if (!run || run._trStale || !run.parent || !Array.isArray(run.glyphs) || !run.glyphs.length) return false;
                const carrier = run.glyphs[0] && run.glyphs[0].sprite;
                if (!carrier || carrier._destroyed || carrier.parent !== run.parent) return false;
                return carrier._trSpriteTextRun === run;
            };

            const measureSpriteRunTextWidth = (drawState, text, height) => {
                if (typeof Bitmap === 'undefined' || !Bitmap) return 0;
                let measureBitmap = null;
                try {
                    measureBitmap = new Bitmap(1, Math.max(1, Math.ceil(height || 24)));
                    applyBitmapDrawState(measureBitmap, drawState);
                    if (typeof measureBitmap.measureTextWidth === 'function') {
                        const width = measureBitmap.measureTextWidth(text);
                        return Number.isFinite(width) ? Math.ceil(width) : 0;
                    }
                } catch (_) {
                    return 0;
                }
                return 0;
            };

            const drawSpriteRunBitmap = (drawState, text, width, height) => {
                const bitmap = new Bitmap(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
                try { applyBitmapDrawState(bitmap, drawState); } catch (_) {}
                bitmap._trBitmapSkipDepth = (bitmap._trBitmapSkipDepth || 0) + 1;
                try {
                    bitmap.drawText(text, 0, 0, bitmap.width, bitmap.height, 'center');
                } finally {
                    bitmap._trBitmapSkipDepth = Math.max(0, (bitmap._trBitmapSkipDepth || 1) - 1);
                }
                return bitmap;
            };

            const applySpriteTextRunTranslation = (run, translated, source, expectedRunId = null) => {
                if (!run || (expectedRunId && run.id !== expectedRunId) || !isSpriteTextRunAlive(run)) return;

                let restored = translated;
                try {
                    if (run.placeholderInfo) {
                        restored = restoreControlCodes(translated, run.placeholderInfo, run.rawText);
                    }
                } catch (restoreError) {
                    logger.warn('[sprite-text/restore-error]', restoreError);
                }
                restored = sanitizeBitmapDrawText(restored, 'drawText');
                if (typeof restored !== 'string') restored = run.rawText;
                const restoredTrimmed = sanitizePerChar(stripRpgmEscapes(restored || '')).trim();
                if (!restoredTrimmed || restoredTrimmed === run.trimmedText) {
                    diag(`[sprite-text/skip-same] parent=${describeSprite(run.parent)} id=${run.id} text="${preview(run.trimmedText)}"`);
                    return;
                }

                const carrier = run.glyphs[0] && run.glyphs[0].sprite;
                if (!carrier) return;
                const outlinePadding = run.drawState && Number.isFinite(run.drawState.outlineWidth)
                    ? Math.max(2, run.drawState.outlineWidth + 2)
                    : 3;
                const measuredWidth = measureSpriteRunTextWidth(run.drawState, restoredTrimmed, run.height);
                const targetWidth = Math.max(
                    1,
                    Math.ceil(run.width || 0),
                    measuredWidth + outlinePadding * 2
                );
                const targetHeight = Math.max(1, Math.ceil(run.height || run.lineHeight || 24));
                const translatedBitmap = drawSpriteRunBitmap(run.drawState, restored, targetWidth, targetHeight);

                try {
                    carrier.bitmap = translatedBitmap;
                    carrier.x = Math.floor((run.bounds ? run.bounds.x1 : 0) - Math.max(0, targetWidth - (run.width || targetWidth)) / 2);
                    carrier.y = Math.floor(run.bounds ? run.bounds.y1 : 0);
                    if (Number.isFinite(Number(carrier.ry))) {
                        carrier.ry = carrier.y;
                    }
                    if (carrier.anchor) {
                        carrier.anchor.x = 0;
                        carrier.anchor.y = 0;
                    }
                    carrier.visible = true;
                    for (let i = 1; i < run.glyphs.length; i++) {
                        const glyphSprite = run.glyphs[i] && run.glyphs[i].sprite;
                        if (glyphSprite && glyphSprite.parent === run.parent) {
                            glyphSprite.visible = false;
                            glyphSprite._trSpriteTextHiddenByRun = run.id;
                        }
                    }
                } catch (applyError) {
                    logger.warn('[sprite-text/apply-error]', applyError);
                    return;
                }

                run.translationStatus = 'completed';
                run.translatedText = restored;
                run.completedAt = Date.now();
                telemetry.logDraw('sprite_text_redraw', restoredTrimmed, run.bounds ? run.bounds.x1 : 0, run.bounds ? run.bounds.y1 : 0, {
                    source,
                    glyphs: run.glyphs.length,
                });
                diag(`[sprite-text/redraw] parent=${describeSprite(run.parent)} src=${source} id=${run.id} text="${preview(run.trimmedText)}" -> "${preview(restoredTrimmed)}" glyphs=${run.glyphs.length}`);
            };

            const activateSpriteTextRunTranslation = (run) => {
                if (!run || run._trStale || run.translationStatus === 'completed' || run.translationStatus === 'translating') return;
                if (!run.normalizedSource || translationCache.shouldSkip(run.normalizedSource) || skipLikeCounter(run.normalizedSource)) {
                    run.translationStatus = 'skipped';
                    diagHot(
                        `sprite-text/skip|${preview(run.normalizedSource)}|${run.glyphs ? run.glyphs.length : 0}`,
                        () => `[sprite-text/skip] parent=${describeSprite(run.parent)} reason=cacheSkip id=${run.id || 'unknown'} text="${preview(run.normalizedSource || '')}"`
                    );
                    return;
                }

                telemetry.logTextDetected('sprite_text', run.trimmedText, run.bounds ? run.bounds.x1 : 0, run.bounds ? run.bounds.y1 : 0, {
                    glyphs: run.glyphs.length,
                });
                diag(`[sprite-text/register] parent=${describeSprite(run.parent)} id=${run.id} text="${preview(run.trimmedText)}" glyphs=${run.glyphs.length} rect=${formatRect(run.bounds)}`);

                try {
                    if (translationCache.completed.has(run.normalizedSource)) {
                        applySpriteTextRunTranslation(run, translationCache.completed.get(run.normalizedSource), 'cache', run.id);
                        return;
                    }
                } catch (cacheError) {
                    logger.warn('[sprite-text/cache-error]', cacheError);
                }

                run.translationStatus = 'translating';
                const targetRunId = run.id;
                run.translationPromise = translationCache.requestTranslation(run.translationSource)
                    .then((translated) => applySpriteTextRunTranslation(run, translated, 'async', targetRunId))
                    .catch((error) => {
                        run.translationStatus = 'error';
                        if (!run._trStale) logger.warn('[sprite-text/translation-error]', error);
                    });
            };

            const createSpriteTextRun = (parent, group) => {
                if (!parent || !Array.isArray(group) || group.length < 2) return null;
                const layouts = group.map(glyphLayout);
                if (layouts.some(layout => !layout || !layout.visibleText)) return null;
                const rawText = group.map(glyph => glyph.fragment && glyph.fragment.rawText ? glyph.fragment.rawText : '').join('');
                const convertedText = stripRpgmEscapes(rawText || '');
                const trimmedText = sanitizePerChar(convertedText).trim();
                if (!trimmedText) return null;

                const bounds = layouts.reduce((acc, layout) => ({
                    x1: Math.min(acc.x1, layout.x),
                    y1: Math.min(acc.y1, layout.y),
                    x2: Math.max(acc.x2, layout.x + layout.width),
                    y2: Math.max(acc.y2, layout.y + layout.height),
                }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
                if (!isValidRect(bounds)) return null;

                const dominant = group.reduce((best, glyph, index) => {
                    const layout = layouts[index];
                    if (!best || layout.width > best.width) return { glyph, layout, width: layout.width };
                    return best;
                }, null);
                const drawState = dominant && dominant.glyph && dominant.glyph.fragment
                    ? dominant.glyph.fragment.drawState
                    : (group[0].fragment ? group[0].fragment.drawState : null);
                const lineHeight = Math.max(...layouts.map(layout => layout.lineHeight || 0), 1);
                const run = {
                    id: nextSpriteRunId(),
                    parent,
                    glyphs: group,
                    rawText,
                    convertedText,
                    trimmedText,
                    bounds,
                    width: Math.max(1, bounds.x2 - bounds.x1),
                    height: Math.max(1, bounds.y2 - bounds.y1, lineHeight),
                    lineHeight,
                    drawState,
                    translationStatus: 'pending',
                    createdAt: Date.now(),
                    debugCallSite: group.map(glyph => glyph.fragment && glyph.fragment.debugCallSite).filter(Boolean)[0] || '',
                };
                run.placeholderInfo = prepareTextForTranslation(run.rawText);
                run.translationSource = run.placeholderInfo
                    ? run.placeholderInfo.textForTranslation
                    : run.rawText;
                run.normalizedSource = String(run.translationSource || '').trim();
                group.forEach((glyph) => {
                    try {
                        if (glyph && glyph.sprite) glyph.sprite._trSpriteTextRun = run;
                    } catch (_) {}
                });
                return run;
            };

            const flushSpriteTextParent = (parent, reason = 'timer') => {
                const state = spriteTextParents ? spriteTextParents.get(parent) : null;
                if (!state || !Array.isArray(state.glyphs) || state.glyphs.length === 0) return;

                const now = Date.now();
                const attached = [];
                const keepSingles = [];
                for (const glyph of state.glyphs) {
                    if (!isGlyphStillAttached(glyph)) continue;
                    if (now - (glyph.seenAt || now) > SPRITE_GLYPH_MAX_PENDING_MS) continue;
                    attached.push(glyph);
                }

                const lines = new Map();
                for (const glyph of attached) {
                    const layout = glyphLayout(glyph);
                    if (!layout || !layout.visibleText) continue;
                    glyph._trSpriteLayout = layout;
                    const yKey = `${Math.round(layout.y)}:${Math.round(layout.height)}:${layout.fontSignature || ''}`;
                    if (!lines.has(yKey)) lines.set(yKey, []);
                    lines.get(yKey).push(glyph);
                }

                const runs = [];
                lines.forEach((lineGlyphs) => {
                    lineGlyphs.sort((a, b) => {
                        const ax = a._trSpriteLayout ? a._trSpriteLayout.x : 0;
                        const bx = b._trSpriteLayout ? b._trSpriteLayout.x : 0;
                        if (ax !== bx) return ax - bx;
                        return (a.order || 0) - (b.order || 0);
                    });

                    let currentBlock = [];
                    let lastGlyph = null;
                    const groups = [];
                    for (const glyph of lineGlyphs) {
                        const layout = glyph._trSpriteLayout;
                        const lastLayout = lastGlyph && lastGlyph._trSpriteLayout;
                        if (!lastGlyph || !lastLayout) {
                            currentBlock = [glyph];
                            groups.push(currentBlock);
                            lastGlyph = glyph;
                            continue;
                        }
                        const gap = layout.x - (lastLayout.x + lastLayout.width);
                        const gapLimit = Math.max(GAP_MIN, Math.ceil((layout.lineHeight || lastLayout.lineHeight || 24) * GAP_RATIO));
                        const sameFont = layout.fontSignature === lastLayout.fontSignature;
                        if (gap > gapLimit || !sameFont) {
                            currentBlock = [glyph];
                            groups.push(currentBlock);
                        } else {
                            currentBlock.push(glyph);
                        }
                        lastGlyph = glyph;
                    }

                    for (const group of groups) {
                        if (group.length < 2) {
                            const glyph = group[0];
                            if (glyph && now - (glyph.seenAt || now) < SPRITE_GLYPH_SINGLE_HOLD_MS) {
                                keepSingles.push(glyph);
                            } else if (glyph) {
                                const text = glyph.fragment ? fragmentVisibleText(glyph.fragment) : '';
                                diagHot(
                                    `sprite-text/skip-single|${text}`,
                                    () => `[sprite-text/skip] parent=${describeSprite(parent)} reason=singleGlyph text="${preview(text)}"`
                                );
                            }
                            continue;
                        }
                        const run = createSpriteTextRun(parent, group);
                        if (run) runs.push(run);
                    }
                });

                state.glyphs = keepSingles;
                if (state.glyphs.length === 0) {
                    state.lastGlyphAt = 0;
                    state.maxInterGlyphMs = 0;
                }
                if (runs.length || state.glyphs.length === 0) {
                    diag(`[sprite-text/flush] parent=${describeSprite(parent)} reason=${reason} runs=${runs.length} held=${state.glyphs.length}`);
                } else {
                    diagHot(
                        `sprite-text/hold|${describeSprite(parent)}`,
                        () => `[sprite-text/hold] parent=${describeSprite(parent)} reason=${reason} held=${state.glyphs.length}`,
                        SPRITE_GLYPH_SINGLE_HOLD_MS
                    );
                }

                for (const run of runs) {
                    activateSpriteTextRunTranslation(run);
                }
                if (state.glyphs.length > 0) {
                    scheduleSpriteTextFlush(parent);
                }
            };

            const runSpriteTextFlushTimer = (parent) => {
                const state = ensureSpriteTextParentState(parent);
                if (!state) return;
                state.flushTimer = null;
                const waitMs = Math.ceil((state.flushDueAt || 0) - Date.now());
                if (waitMs > 8) {
                    state.flushTimer = setTimeout(
                        () => runSpriteTextFlushTimer(parent),
                        Math.min(waitMs, SPRITE_GLYPH_MAX_DELAY_MS)
                    );
                    return;
                }
                state.flushDueAt = 0;
                try {
                    flushSpriteTextParent(parent, 'timer');
                } catch (error) {
                    logger.warn('[sprite-text/flush-error]', error);
                }
            };

            const scheduleSpriteTextFlush = (parent) => {
                const state = ensureSpriteTextParentState(parent);
                if (!state) return;
                state.flushDueAt = Date.now() + resolveSpriteTextDelay(state);
                if (state.flushTimer) return;
                state.flushTimer = setTimeout(() => {
                    runSpriteTextFlushTimer(parent);
                }, resolveSpriteTextDelay(state));
            };

            const enqueueSpriteGlyph = (parent, sprite, bitmap, fragment) => {
                if (!parent || !sprite || !bitmap || !fragment || fragment._trSpriteGlyphClaimed) return false;
                const state = ensureSpriteTextParentState(parent);
                if (!state) return false;

                fragment._trSpriteGlyphClaimed = true;
                removePendingBitmapFragment(bitmap, fragment);
                const now = Date.now();
                if (state.lastGlyphAt > 0) {
                    const interval = now - state.lastGlyphAt;
                    if (Number.isFinite(interval) && interval >= 0) {
                        state.maxInterGlyphMs = Math.min(
                            SPRITE_GLYPH_MAX_DELAY_MS,
                            Math.max(state.maxInterGlyphMs || 0, interval)
                        );
                    }
                }
                state.lastGlyphAt = now;
                const glyph = {
                    parent,
                    sprite,
                    bitmap,
                    fragment,
                    seenAt: now,
                    order: state.glyphs.length ? Math.max(...state.glyphs.map(item => item.order || 0)) + 1 : 1,
                };
                state.glyphs.push(glyph);
                try { sprite._trSpriteGlyphFragment = fragment; } catch (_) {}
                scheduleSpriteTextFlush(parent);
                return true;
            };

            const observeSpriteChildText = (parent, child) => {
                if (!parent || !child || child._trSpriteTextObserverBypass) return;
                let bitmap = null;
                try { bitmap = child.bitmap; } catch (_) { bitmap = null; }
                if (!bitmap) return;
                const fragment = bitmap._trStandaloneSpriteGlyphFragment;
                if (!fragment || !fragment.standaloneSpriteGlyphCandidate) return;
                const age = Date.now() - (fragment.timestamp || Date.now());
                if (age < 0 || age > SPRITE_GLYPH_MAX_PENDING_MS) return;
                enqueueSpriteGlyph(parent, child, bitmap, fragment);
            };

            const observeSpriteTextRemoval = (child) => {
                if (!child) return;
                const run = child._trSpriteTextRun;
                if (run && child === (run.glyphs[0] && run.glyphs[0].sprite)) {
                    markSpriteTextRunStale(run, 'carrier-removed');
                }
            };

            const installSpriteChildObserverOn = (target, label) => {
                try {
                    if (!target) return false;
                    let installed = false;
                    if (typeof target.addChild === 'function' && target.addChild.__trSpriteChildObserver !== SPRITE_CHILD_OBSERVER_TOKEN) {
                        const originalAddChild = target.addChild.__trOriginal || target.addChild;
                        const wrappedAddChild = function(...children) {
                            const result = originalAddChild.apply(this, children);
                            try {
                                children.forEach(child => observeSpriteChildText(this, child));
                            } catch (error) {
                                logger.warn('[sprite-text/addChild-observer-error]', error);
                            }
                            return result;
                        };
                        wrappedAddChild.__trSpriteChildObserver = SPRITE_CHILD_OBSERVER_TOKEN;
                        wrappedAddChild.__trOriginal = originalAddChild;
                        target.addChild = wrappedAddChild;
                        installed = true;
                    }
                    if (typeof target.removeChild === 'function' && target.removeChild.__trSpriteChildObserver !== SPRITE_CHILD_OBSERVER_TOKEN) {
                        const originalRemoveChild = target.removeChild.__trOriginal || target.removeChild;
                        const wrappedRemoveChild = function(...children) {
                            const result = originalRemoveChild.apply(this, children);
                            try {
                                children.forEach(observeSpriteTextRemoval);
                            } catch (_) {}
                            return result;
                        };
                        wrappedRemoveChild.__trSpriteChildObserver = SPRITE_CHILD_OBSERVER_TOKEN;
                        wrappedRemoveChild.__trOriginal = originalRemoveChild;
                        target.removeChild = wrappedRemoveChild;
                        installed = true;
                    }
                    if (installed) diag(`[sprite-text/hook] Installed child observer on ${label}`);
                    return installed;
                } catch (error) {
                    logger.warn(`[sprite-text/hook-error] Failed to observe ${label}`, error);
                    return false;
                }
            };

            const installSpriteChildObserver = () => {
                const targets = [];
                try {
                    if (typeof PIXI !== 'undefined' && PIXI && PIXI.Container && PIXI.Container.prototype) {
                        targets.push({ target: PIXI.Container.prototype, label: 'PIXI.Container' });
                    }
                } catch (_) {}
                try {
                    if (typeof PIXI !== 'undefined' && PIXI && PIXI.DisplayObjectContainer && PIXI.DisplayObjectContainer.prototype) {
                        targets.push({ target: PIXI.DisplayObjectContainer.prototype, label: 'PIXI.DisplayObjectContainer' });
                    }
                } catch (_) {}
                try {
                    if (typeof Sprite !== 'undefined' && Sprite && Sprite.prototype && Object.prototype.hasOwnProperty.call(Sprite.prototype, 'addChild')) {
                        targets.push({ target: Sprite.prototype, label: 'Sprite' });
                    }
                } catch (_) {}

                const seen = [];
                let installedAny = false;
                for (const item of targets) {
                    if (!item || !item.target || seen.indexOf(item.target) >= 0) continue;
                    seen.push(item.target);
                    installedAny = installSpriteChildObserverOn(item.target, item.label) || installedAny;
                }
                return installedAny;
            };

            const activateBitmapEntryTranslation = (entry) => {
                if (!entry || entry._trStale || !entry.isTranslatable) return;
                if (entry.translationStatus === 'completed' || entry.translationStatus === 'translating') return;
                const state = bitmapStates.get(entry.bitmap);
                if (!state || state.entries.get(entry.key) !== entry) return;

                try {
                    if (translationCache.completed.has(entry.normalizedSource)) {
                        const translated = translationCache.completed.get(entry.normalizedSource);
                        applyBitmapTranslation(entry, translated, 'cache', entry.instanceId);
                        return;
                    }
                } catch (cacheErr) {
                    logger.warn('[bitmap/cache-error]', cacheErr);
                }

                entry.translationStatus = 'translating';
                const targetInstanceId = entry.instanceId;
                entry.translationPromise = translationCache.requestTranslation(entry.translationSource)
                    .then(translated => applyBitmapTranslation(entry, translated, 'async', targetInstanceId))
                    .catch(error => {
                        entry.translationStatus = 'error';
                        if (!entry._trStale) {
                            logger.warn('[bitmap/translation-error]', error);
                        }
                    });
            };

            const registerBitmapEntry = (entry, activationQueue = null) => {
                const { bitmap, key } = entry;
                const state = bitmapStates.get(bitmap);
                if (!state) return;

                const normalized = entry.trimmedText;
                const looksLikeCounter = skipLikeCounter(normalized);
                const standaloneSpriteGlyph = entry.spriteGlyphCandidate && textUnitCount(normalized) <= 1;
                const shouldSkipText = !!normalized && !looksLikeCounter && translationCache.shouldSkip(normalized);
                if (!normalized || standaloneSpriteGlyph || looksLikeCounter || shouldSkipText) {
                    const reason = !normalized ? 'empty' : (standaloneSpriteGlyph ? 'spriteGlyph' : (looksLikeCounter ? 'counterLike' : 'cacheSkip'));
                    const existing = state.entries.get(key);
                    if (existing) {
                        markEntryStale(state, existing, 'native-replace', { rect: deriveEntryRect(existing) });
                    }
                    entry.drawOrder = 0;
                    entry.isTranslatable = false;
                    entry.translationStatus = 'skipped';
                    const nativeOp = recordNativeBitmapTextOp(entry);
                    if (nativeOp && nativeOp.drawOrder) entry.drawOrder = nativeOp.drawOrder;
                    diag(`[bitmap/skip] ${describeBitmap(bitmap)} ${describeEntry(entry)} reason=${reason} replay=${nativeOp ? `nativeOp#${nativeOp.drawOrder}` : 'none'} text="${preview(normalized)}"${entry.debugCallSite ? ` site=${entry.debugCallSite}` : ''}`);
                    return null;
                }

                removeNativeTextOpByKey(state, key);
                const existing = state.entries.get(key);
                if (existing && existing.trimmedText === entry.trimmedText) {
                    existing.detectedAt = Date.now();
                    existing.rawText = entry.rawText;
                    existing.visibleText = entry.visibleText;
                    existing.convertedText = entry.convertedText;
                    existing.drawParams = entry.drawParams;
                    existing.bounds = entry.bounds;
                    existing.drawState = entry.drawState;
                    existing.fragments = entry.fragments;
                    existing.position = entry.position;
                    existing.methodName = entry.methodName;
                    existing.debugCallSite = entry.debugCallSite;
                    existing.drawOrder = nextDrawOrder(state);
                    diag(`[bitmap/entry-skip] ${describeBitmap(bitmap)} ${describeEntry(existing)} text="${preview(entry.trimmedText)}"${existing.debugCallSite ? ` site=${existing.debugCallSite}` : ''}`);
                    if (activationQueue && existing.translationStatus === 'pending') {
                        activationQueue.push(existing);
                    } else if (!activationQueue) {
                        activateBitmapEntryTranslation(existing);
                    }
                    return existing;
                }
                if (existing) {
                    markEntryStale(state, existing, 'replace', { rect: deriveEntryRect(existing) });
                }

                entry.drawOrder = nextDrawOrder(state);
                entry.isTranslatable = true;
                entry.translationStatus = 'pending';
                state.entries.set(key, entry);
                entry.placeholderInfo = prepareTextForTranslation(entry.rawText);
                entry.translationSource = entry.placeholderInfo
                    ? entry.placeholderInfo.textForTranslation
                    : entry.rawText;
                entry.normalizedSource = String(entry.translationSource || '').trim();
                if (!entry.normalizedSource) {
                    state.entries.delete(key);
                    entry.isTranslatable = false;
                    entry.translationStatus = 'skipped';
                    entry.drawOrder = 0;
                    const nativeOp = recordNativeBitmapTextOp(entry);
                    if (nativeOp && nativeOp.drawOrder) entry.drawOrder = nativeOp.drawOrder;
                    diag(`[bitmap/skip] ${describeBitmap(bitmap)} ${describeEntry(entry)} reason=emptyNormalized replay=${nativeOp ? `nativeOp#${nativeOp.drawOrder}` : 'none'} text="${preview(entry.trimmedText)}"`);
                    return null;
                }

                const now = Date.now();
                entry.instanceId = nextInstanceId();
                entry.createdAt = now;

                telemetry.logTextDetected('bitmap', normalized, entry.drawParams.x, entry.drawParams.y, {
                    ownerType: entry.ownerType,
                    fragments: entry.fragments.length,
                });
                diag(`[bitmap/register] ${describeBitmap(bitmap)} ${describeEntry(entry)} text="${preview(normalized)}" fragments=${entry.fragments.length}${entry.debugCallSite ? ` site=${entry.debugCallSite}` : ''}`);
                if (state.instanceMap) {
                    state.instanceMap.set(entry.instanceId, entry);
                }
                if (activationQueue) {
                    activationQueue.push(entry);
                } else {
                    activateBitmapEntryTranslation(entry);
                }
                return entry;
            };

            const applyBitmapTranslation = (entry, translated, source, expectedInstanceId = null) => {
                if (!entry || entry._trStale) return;
                if (expectedInstanceId && entry.instanceId !== expectedInstanceId) {
                    diag(`[bitmap/skip-uuid] ${describeBitmap(entry.bitmap)} ${describeEntry(entry)} expected=${expectedInstanceId} text="${preview(entry.trimmedText)}"`);
                    return;
                }
                const state = bitmapStates.get(entry.bitmap);
                if (!state || state.entries.get(entry.key) !== entry) return;

                let restored = translated;
                try {
                    if (entry.placeholderInfo) {
                        restored = restoreControlCodes(translated, entry.placeholderInfo, entry.rawText);
                    }
                } catch (restoreError) {
                    logger.warn('[bitmap/restore-error]', restoreError);
                }
                restored = sanitizeBitmapDrawText(restored, entry.methodName);
                if (typeof restored !== 'string') restored = entry.rawText;
                const restoredTrimmed = sanitizePerChar(stripRpgmEscapes(restored || '')).trim();
                if (!restoredTrimmed || restoredTrimmed === entry.trimmedText) {
                    diag(`[bitmap/skip-same] ${describeBitmap(entry.bitmap)} ${describeEntry(entry)} text="${preview(entry.trimmedText)}"`);
                    return;
                }

                const bitmap = entry.bitmap;
                if (!bitmap) return;

                const prevActiveEntry = bitmap._trActiveRedrawEntry || null;
                bitmap._trActiveRedrawEntry = entry;
                try {
                    const outlinePadding = entry.drawState && Number.isFinite(entry.drawState.outlineWidth)
                        ? Math.max(1, entry.drawState.outlineWidth + 1)
                        : 2;
                    const clearRect = calculateClearRect(bitmap, entry, outlinePadding);
                    const guardRect = clearRect && clearRect.width > 0 && clearRect.height > 0
                        ? rectFromDimensions(clearRect.x, clearRect.y, clearRect.width, clearRect.height)
                        : null;
                    const currentOrder = entry.drawOrder || 0;
                    const replayBefore = guardRect
                        ? collectReplayItems(state, guardRect, entry, order => order < currentOrder)
                        : [];
                    const replayAfter = guardRect
                        ? collectReplayItems(state, guardRect, entry, order => order > currentOrder)
                        : [];
                    diag(`[bitmap/redraw] ${describeBitmap(bitmap)} src=${source} method=${entry.methodName || 'drawText'} ${describeEntry(entry)} "${preview(entry.trimmedText)}" -> "${preview(restoredTrimmed)}"`);
                    if (shouldTraceBitmapDiagnostics()) {
                        diag(`[bitmap/redraw-plan] ${describeBitmap(bitmap)} clear=${guardRect ? formatRect(guardRect) : 'n/a'} before=${replayBefore.length} [${summarizeReplayItems(replayBefore)}] after=${replayAfter.length} [${summarizeReplayItems(replayAfter)}]${entry.debugCallSite ? ` site=${entry.debugCallSite}` : ''}`);
                    }
                    telemetry.logDraw('bitmap_redraw', restoredTrimmed, entry.drawParams.x, entry.drawParams.y, {
                        ownerType: entry.ownerType,
                        source,
                        method: entry.methodName || 'drawText',
                    });
                    withBitmapReplay(bitmap, () => {
                        if (clearRect && clearRect.width > 0 && clearRect.height > 0) {
                            try { bitmap.clearRect(clearRect.x, clearRect.y, clearRect.width, clearRect.height); } catch (_) {}
                        }
                        replayBitmapItems(bitmap, replayBefore);
                        drawBitmapTextValue(bitmap, entry, restored);
                        replayBitmapItems(bitmap, replayAfter);
                    });
                } finally {
                    bitmap._trActiveRedrawEntry = prevActiveEntry;
                }

                entry.translationStatus = 'completed';
                entry.translatedText = restored;
                entry.completedAt = Date.now();
            };

            Bitmap.prototype._trFlushAggregatedLines = function() {
                flushAggregatedLines(this, 'bitmap.flush');
            };

            const processBitmapDrawInvocation = (methodName, originalFn, bitmap, args) => {
                const [inputText, rawX, rawY, maxWidth, lineHeight, align] = args;
                const textStr = String(inputText ?? '');
                const safeAlign = normalizeCanvasTextAlign(align);
                const callArgs = [textStr, rawX, rawY, maxWidth, lineHeight, safeAlign];

                if (textStr.startsWith(REDRAW_SIGNATURE)) {
                    const cleanText = textStr.substring(REDRAW_SIGNATURE.length);
                    diag(`[bitmap/bypass:${methodName}] Signed input "${preview(cleanText)}" at (${rawX},${rawY})`);
                    callArgs[0] = cleanText;
                    return originalFn.apply(bitmap, callArgs);
                }

                if (bitmap && bitmap._trBitmapReplayDepth && bitmap._trBitmapReplayDepth > 0) {
                    return originalFn.apply(bitmap, callArgs);
                }

                if (!bitmap || (bitmap._trBitmapSkipDepth && bitmap._trBitmapSkipDepth > 0)) {
                    return originalFn.apply(bitmap, callArgs);
                }

                if (bitmap._trPreferWindowPipeline && bitmap._trWindowPipelineDepth > 0) {
                    return originalFn.apply(bitmap, callArgs);
                }

                if (bitmap._trMessageContents) {
                    return originalFn.apply(bitmap, callArgs);
                }

                const owner = contentsOwners && contentsOwners.get ? contentsOwners.get(bitmap) : null;
                const ownerType = owner && owner.constructor ? owner.constructor.name : (bitmap.constructor ? bitmap.constructor.name : 'Bitmap');
                const debugCallSite = shouldCaptureBitmapCallSites()
                    ? captureBitmapCallSite(true)
                    : '';
                const smallTextBypass = isSmallTextScratchBitmap(bitmap)
                    || isSmallTextDrawActive(bitmap)
                    || (debugCallSite && /\bBitmap\.drawSmallText\b/.test(debugCallSite));
                if (smallTextBypass) {
                    const visiblePreview = preview(stripRpgmEscapes(textStr));
                    diagHot(
                        `bitmap/bypass-small-text|${ownerType}|${bitmap.width || 0}x${bitmap.height || 0}|${visiblePreview}|${debugCallSite}`,
                        () => `[bitmap/bypass-small-text] ${describeBitmap(bitmap, owner)} text="${visiblePreview}"${debugCallSite ? ` site=${debugCallSite}` : ''}`
                    );
                    return originalFn.apply(bitmap, callArgs);
                }
                if (!owner
                    && ownerType === 'Bitmap'
                    && (isNormalCharacterDrawActive(bitmap) || (debugCallSite && /\bprocessNormalCharacter\b/.test(debugCallSite)))) {
                    const visiblePreview = preview(stripRpgmEscapes(textStr));
                    diagHot(
                        `bitmap/bypass-normal-char|${ownerType}|${bitmap.width || 0}x${bitmap.height || 0}|${visiblePreview}|${debugCallSite}`,
                        () => `[bitmap/bypass-normal-char] ${describeBitmap(bitmap, owner)} text="${visiblePreview}"${debugCallSite ? ` site=${debugCallSite}` : ''}`
                    );
                    return originalFn.apply(bitmap, callArgs);
                }
                if (hasDedicatedOwnerHook(owner) || bitmap._trHasDedicatedTextHook) {
                    const visiblePreview = preview(stripRpgmEscapes(textStr));
                    diagHot(
                        `bitmap/bypass-owner|${ownerType}|${bitmap.width || 0}x${bitmap.height || 0}|${visiblePreview}`,
                        () => `[bitmap/bypass-owner] ${describeBitmap(bitmap, owner)} text="${visiblePreview}"`
                    );
                    return originalFn.apply(bitmap, callArgs);
                }
                const state = ensureBitmapState(bitmap);
                if (!state) {
                    return originalFn.apply(bitmap, callArgs);
                }

                const numericX = Number(rawX);
                const numericY = Number(rawY);
                const numericLineHeight = Number(lineHeight);
                const numericMaxWidth = Number(maxWidth);
                const safeX = Number.isFinite(numericX) ? numericX : 0;
                const safeY = Number.isFinite(numericY) ? numericY : 0;
                const safeLineHeight = Number.isFinite(numericLineHeight) && numericLineHeight > 0
                    ? numericLineHeight
                    : (bitmap.fontSize || 24);
                const widthEstimate = estimateWidth(bitmap, textStr, maxWidth);
                const drawState = captureBitmapDrawState(bitmap);
                const fragment = {
                    bitmap,
                    methodName,
                    rawText: textStr,
                    visibleText: stripRpgmEscapes(textStr || ''),
                    x: safeX,
                    y: safeY,
                    maxWidth: Number.isFinite(numericMaxWidth) ? numericMaxWidth : widthEstimate,
                    lineHeight: safeLineHeight,
                    align: safeAlign,
                    width: Math.max(0, widthEstimate),
                    ownerType,
                    drawState,
                    fontSignature: computeFontSignature(drawState, bitmap),
                    timestamp: Date.now(),
                    debugCallSite,
                };
                fragment.standaloneSpriteGlyphCandidate = isStandaloneSpriteGlyphCandidate(bitmap, fragment, owner);
                if (fragment.standaloneSpriteGlyphCandidate) {
                    try { bitmap._trStandaloneSpriteGlyphFragment = fragment; } catch (_) {}
                }

                if (shouldTraceBitmapDiagnostics()) {
                    diag(`[bitmap/fragment:${methodName}] ${describeBitmap(bitmap, owner)} text="${preview(fragment.visibleText)}" @ (${safeX},${safeY}) width=${Math.round(fragment.width)} max=${Math.round(Number.isFinite(fragment.maxWidth) ? fragment.maxWidth : fragment.width)} line=${Math.round(fragment.lineHeight)}${debugCallSite ? ` site=${debugCallSite}` : ''}`);
                }

                const result = originalFn.apply(bitmap, callArgs);

                try {
                    if (fragment.standaloneSpriteGlyphCandidate) {
                        return result;
                    }
                    const stateRef = ensureBitmapState(bitmap);
                    if (!stateRef) return result;
                    stateRef.fragments.push(fragment);
                    if (stateRef.fragments.length > 200) {
                        flushAggregatedLines(bitmap, 'overflow');
                    } else {
                        scheduleFlush(bitmap);
                    }
                } catch (fragmentError) {
                    logger.warn('[bitmap/fragment-error]', fragmentError);
                }

                return result;
            };

            const installBitmapDrawWrapper = (methodName) => {
                try {
                    const current = Bitmap.prototype[methodName];
                    if (typeof current !== 'function') {
                        diag(`[bitmap/hook] Bitmap.${methodName} not available (yet).`);
                        return false;
                    }
                    if (current && current.__trBitmapWrapper === DRAW_WRAPPER_TOKEN) {
                        return true;
                    }
                    const originalFn = current && current.__trOriginal ? current.__trOriginal : current;
                    const wrapped = function(...args) {
                        return processBitmapDrawInvocation(methodName, originalFn, this, args);
                    };
                    wrapped.__trBitmapWrapper = DRAW_WRAPPER_TOKEN;
                    wrapped.__trOriginal = originalFn;
                    try { wrapped.name = `trWrapped_${methodName}`; } catch (_) {}
                    Bitmap.prototype[methodName] = wrapped;
                    diag(`[bitmap/hook] Wrapped Bitmap.${methodName}`);
                    return true;
                } catch (wrapError) {
                    logger.error(`[bitmap/hook-error] Failed to wrap ${methodName}`, wrapError);
                    return false;
                }
            };

            const hookRetryTimers = new Map();
            const scheduleBitmapHookRetry = (methodName) => {
                if (hookRetryTimers.has(methodName)) return;
                let attempts = 0;
                const maxAttempts = 20;
                const timer = setInterval(() => {
                    attempts++;
                    if (installBitmapDrawWrapper(methodName) || attempts >= maxAttempts) {
                        clearInterval(timer);
                        hookRetryTimers.delete(methodName);
                        if (attempts >= maxAttempts) {
                            diag(`[bitmap/hook] Gave up retrying Bitmap.${methodName}`);
                        }
                    }
                }, 500);
                hookRetryTimers.set(methodName, timer);
            };

            const markerRetryTimers = new Map();
            const scheduleMarkerRetry = (key, installer) => {
                if (markerRetryTimers.has(key)) return;
                let attempts = 0;
                const maxAttempts = 20;
                const timer = setInterval(() => {
                    attempts++;
                    if (installer() || attempts >= maxAttempts) {
                        clearInterval(timer);
                        markerRetryTimers.delete(key);
                    }
                }, 500);
                markerRetryTimers.set(key, timer);
            };

            if (!installSmallTextMarker(Bitmap.prototype, 'drawSmallText')) {
                scheduleMarkerRetry('Bitmap.prototype.drawSmallText', () => installSmallTextMarker(Bitmap.prototype, 'drawSmallText'));
            }
            if (!installSmallTextMarker(Bitmap, 'drawSmallText')) {
                scheduleMarkerRetry('Bitmap.drawSmallText', () => installSmallTextMarker(Bitmap, 'drawSmallText'));
            }
            if (!installNormalCharacterMarker()) {
                scheduleMarkerRetry('Window_Base.processNormalCharacter', installNormalCharacterMarker);
            }
            if (!installSpriteChildObserver()) {
                scheduleMarkerRetry('PIXI.Container.addChild', installSpriteChildObserver);
            }

            installBitmapDrawWrapper('drawText');

            const extraDrawMethods = ['drawTextS', 'drawTextM'];
            extraDrawMethods.forEach((name) => {
                if (!installBitmapDrawWrapper(name)) {
                    scheduleBitmapHookRetry(name);
                }
            });

            diag('[bitmap/init] Bitmap draw hooks installed.');
        } catch (error) {
            logger.error('[bitmap/init-error]', error);
        }
    }

    

    // Hook Window_Help.setText to capture full descriptions (items, skills, etc.)
    // Very common and whole-string; integrates with cache and signature bypass.
    function trackHelpWindow() {
        try {
            if (typeof Window_Help === 'undefined' || !Window_Help || !Window_Help.prototype) return;
            const originalSetText = Window_Help.prototype.setText;
            if (typeof originalSetText !== 'function') return;

            Window_Help.prototype.setText = function(text) {
                try {
                    const textStr = String(text);

                    // Bypass if already signed
                    if (textStr.startsWith(REDRAW_SIGNATURE)) {
                        const clean = textStr.substring(REDRAW_SIGNATURE.length);
                        return originalSetText.call(this, clean);
                    }

                    // Prefer translating after escape conversion for better context
                    let converted = textStr;
                    try { converted = this.convertEscapeCharacters(textStr); } catch (_) {}

                    const placeholderInfo = prepareTextForTranslation(converted || '');
                    const translationSource = placeholderInfo.textForTranslation;
                    const norm = String(translationSource || '').trim();
                    if (!norm || translationCache.shouldSkip(norm)) {
                        return originalSetText.call(this, textStr);
                    }

                    // Cache hit: apply translated immediately
                    try {
                        if (translationCache.completed.has(norm)) {
                            let translated = translationCache.completed.get(norm);
                            translated = restoreControlCodes(translated, placeholderInfo, converted || textStr);
                            // Skip replacement if original and translated text are the same
                            if (typeof translated !== 'string' || translated.trim() === (converted || '').trim()) {
                                dbg(`[Help Skip] Original and translated text are identical: "${preview(norm)}"`);
                                return originalSetText.call(this, textStr);
                            }
                            const signed = REDRAW_SIGNATURE + translated;
                            return originalSetText.call(this, signed);
                        }
                    } catch (_) {}

                    // Async path: set original now, then update when ready if unchanged
                    this._trHelpVersion = (this._trHelpVersion | 0) + 1;
                    const version = this._trHelpVersion;
                    const self = this;
                    const res = originalSetText.call(this, textStr);
                    translationCache.requestTranslation(translationSource)
                        .then(translated => {
                            try {
                                if (self._trHelpVersion !== version) return; // superseded by newer setText
                                // Skip replacement if original and translated text are the same
                                let restored = restoreControlCodes(translated, placeholderInfo, converted || textStr);
                                if (typeof restored !== 'string' || restored.trim() === (converted || '').trim()) {
                                    dbg(`[Help Async Skip] Original and translated text are identical: "${preview(norm)}"`);
                                    return;
                                }
                                const signed = REDRAW_SIGNATURE + restored;
                                originalSetText.call(self, signed);
                            } catch (_) { /* ignore */ }
                        })
                        .catch(() => { /* keep original on failure */ });
                    return res;
                } catch (e) {
                    logger.error('[Window_Help.setText Hook Error]', e);
                    return originalSetText.call(this, text);
                }
            };
            dbg('[Help] Hooked Window_Help.setText');
        } catch (e) {
            logger.error('[Help Hook Error]', e);
        }
    }

    // Initialize after game engine loads

        return {
            trackGameMessage,
            trackChoiceList,
            trackPixiText,
            trackBitmapDrawText,
            trackHelpWindow,
            drawMessageFaceIfNeeded,
            redrawGameMessageText,
            resolveMessageStartCoordinates,
        };
    };
})();
