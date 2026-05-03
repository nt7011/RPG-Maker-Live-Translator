// Game message text hook implementation and redraw helpers.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks) {
        globalScope.LiveTranslatorModules.hooks = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/game-message-hook.js.');
    }

    function installGameMessageHook(context = {}) {
        const {
            logger,
            dbg = () => {},
            diag = () => {},
            preview = (text) => String(text ?? ''),
            stripRpgmEscapes,
            prepareTextForTranslation,
            restoreControlCodes,
            telemetry,
            textTracker,
            translationCache,
            settings,
            captureBitmapDrawState,
            applyBitmapDrawState,
            generateKey,
            contentsOwners,
            windowRegistry,
            registeredWindows,
            PER_CHAR_MARK,
            REDRAW_SIGNATURE = '',
            perf,
            logEscape = () => {},
        } = context;
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

    // Private-use sentinels let us distinguish authored message breaks from
    // plugin-added layout wraps without depending on any specific game plugin.
    const GAME_MESSAGE_BREAK_SENTINEL_PREFIX = '\uE000LTMB';
    const GAME_MESSAGE_BREAK_SENTINEL_SUFFIX = '\uE001';
    const GAME_MESSAGE_RAW_BREAK_PATTERN = /\f|\r\n|\r|\n/g;
    const GAME_MESSAGE_SOFT_BREAK_PATTERN = /[ \t\v]*(?:\f|\r\n|\r|\n)[ \t\v]*/g;
    const GAME_MESSAGE_NO_SPACE_LINE_JOIN_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
    const GAME_MESSAGE_SENTINEL_BOUNDARY_PATTERN = /[\uE000\uE001]/u;

    function createGameMessageBreakToken(index) {
        return `${GAME_MESSAGE_BREAK_SENTINEL_PREFIX}${index}${GAME_MESSAGE_BREAK_SENTINEL_SUFFIX}`;
    }

    function createGameMessageBreakMap(rawText) {
        const source = String(rawText || '');
        const breaks = [];
        const markedText = source.replace(GAME_MESSAGE_RAW_BREAK_PATTERN, (value) => {
            const token = createGameMessageBreakToken(breaks.length);
            breaks.push({ token, value });
            return token;
        });
        return {
            markedText,
            breaks,
            hadHardMessageBreaks: breaks.length > 0,
            originAware: true,
        };
    }

    function countTokenOccurrences(text, token) {
        if (!token) return 0;
        let count = 0;
        let index = String(text || '').indexOf(token);
        while (index !== -1) {
            count++;
            index = String(text || '').indexOf(token, index + token.length);
        }
        return count;
    }

    function previousNonHorizontalWhitespace(text, index) {
        for (let i = index - 1; i >= 0; i--) {
            const character = text.charAt(i);
            if (character !== ' ' && character !== '\t' && character !== '\v') {
                return character;
            }
        }
        return '';
    }

    function nextNonHorizontalWhitespace(text, index) {
        for (let i = index; i < text.length; i++) {
            const character = text.charAt(i);
            if (character !== ' ' && character !== '\t' && character !== '\v') {
                return character;
            }
        }
        return '';
    }

    function shouldJoinSoftBreakWithoutSpace(before, after) {
        if (!before || !after) return true;
        if (GAME_MESSAGE_SENTINEL_BOUNDARY_PATTERN.test(before)
            || GAME_MESSAGE_SENTINEL_BOUNDARY_PATTERN.test(after)) {
            return true;
        }
        return GAME_MESSAGE_NO_SPACE_LINE_JOIN_PATTERN.test(before)
            && GAME_MESSAGE_NO_SPACE_LINE_JOIN_PATTERN.test(after);
    }

    function collapseGameMessageSoftBreaks(text) {
        const source = String(text || '');
        return source
            .replace(GAME_MESSAGE_SOFT_BREAK_PATTERN, (match, offset) => {
                const before = previousNonHorizontalWhitespace(source, offset);
                const after = nextNonHorizontalWhitespace(source, offset + match.length);
                return shouldJoinSoftBreakWithoutSpace(before, after) ? '' : ' ';
            })
            .replace(/[ \t\v]{2,}/g, ' ');
    }

    function normalizeConvertedGameMessageText(convertedText, breakMap) {
        const converted = String(convertedText || '');
        if (!breakMap || !breakMap.originAware || !Array.isArray(breakMap.breaks)) {
            return { reliable: false, text: converted, messageBreakInfo: null };
        }

        // Fail closed. If a plugin removes, duplicates, or otherwise mutates a
        // sentinel, we cannot prove break origin, so the caller keeps old behavior.
        for (const item of breakMap.breaks) {
            if (!item || countTokenOccurrences(converted, item.token) !== 1) {
                return { reliable: false, text: converted, messageBreakInfo: null };
            }
        }

        let text = collapseGameMessageSoftBreaks(converted);
        breakMap.breaks.forEach((item) => {
            text = text.replace(item.token, item.value);
        });
        return {
            reliable: true,
            text,
            messageBreakInfo: {
                originAware: true,
                hadHardMessageBreaks: !!breakMap.hadHardMessageBreaks,
                hardBreakCount: breakMap.breaks.length,
            },
        };
    }

    function sanitizeRestoredGameMessageText(text, payload) {
        if (typeof text !== 'string') return text;
        const info = payload && payload.messageBreakInfo;
        if (info && info.originAware && !info.hadHardMessageBreaks) {
            return collapseGameMessageSoftBreaks(text);
        }
        return text;
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

    function resolveGameMessageOriginAwareLineBreaks(config) {
        if (!config || typeof config !== 'object') return false;
        const gameMessage = config.gameMessage;
        if (!gameMessage || typeof gameMessage !== 'object') return false;
        const raw = gameMessage.originAwareLineBreaks;
        if (raw === true) return true;
        if (typeof raw === 'string' && raw.trim().toLowerCase() === 'true') return true;
        return false;
    }

    const gameMessageOriginAwareLineBreaks = resolveGameMessageOriginAwareLineBreaks(settings);

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
        try {
            if (typeof windowInstance.lineHeight === 'function') {
                const nativeLineHeight = Number(windowInstance.lineHeight());
                if (Number.isFinite(nativeLineHeight) && nativeLineHeight > 0) {
                    return Math.max(1, Math.ceil(nativeLineHeight));
                }
            }
        } catch (_) {}
        const fontSize = Number(windowInstance.contents.fontSize);
        return Number.isFinite(fontSize) && fontSize > 0 ? fontSize + 8 : 32;
    }

    function canSoftWrapGameMessageText(contentsHeight, lineHeight) {
        const height = Number(contentsHeight);
        const line = Number(lineHeight);
        if (!Number.isFinite(height) || height <= 0 || height === Number.MAX_SAFE_INTEGER) return true;
        if (!Number.isFinite(line) || line <= 0) return true;
        return height >= line * 2;
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
        if (!wrapState.allowSoftWrapLineBreaks) {
            appendMeasuredGameMessageText(windowInstance, wrapState, output, text);
            return;
        }
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
        wrapState.allowSoftWrapLineBreaks = canSoftWrapGameMessageText(
            wrapState.contentsHeight,
            wrapState.lineHeight
        );
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
                    if (wrapState.allowSoftWrapLineBreaks
                        && wrapState.hasContentOnLine
                        && wrapState.currentX + iconWidth > wrapState.contentsWidth) {
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
                if (wrapState.allowSoftWrapLineBreaks
                    && wrapState.hasContentOnLine
                    && wrapState.currentX + spaceWidth > wrapState.contentsWidth) {
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

    function createEscapeAwarePayload(rawText, context = 'message', options = {}) {
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
            messageBreakInfo: options.messageBreakInfo || null,
        };
    }

    function restoreMessageText(translated, payload) {
        if (!payload) return translated;
        const candidate = translated;

        try {
            const restored = restoreControlCodes(candidate, payload.placeholderInfo, payload.resolved);
            if (typeof restored === 'string' && restored.length) {
                return sanitizeRestoredGameMessageText(restored, payload);
            }
        } catch (error) {
            logger.warn('[GameMessage] restoreControlCodes failed; falling back to original text.', error);
        }
        const stripped = stripRpgmEscapes(candidate || '').trim();
        logEscape('debug', 'restoreControlCodes threw; using stripped translated text as fallback.', {
            strippedPreview: preview(stripped),
        });
        return sanitizeRestoredGameMessageText(stripped || payload.resolved, payload);
    }

    function restoreMessageTextStreaming(translated, payload) {
        if (!payload || typeof translated !== 'string') return translated;
        if (!payload.placeholderInfo) return sanitizeRestoredGameMessageText(translated, payload);
        try {
            const restored = restoreControlCodes(translated, payload.placeholderInfo, payload.resolved);
            return sanitizeRestoredGameMessageText(typeof restored === 'string' ? restored : translated, payload);
        } catch (_) {
            return sanitizeRestoredGameMessageText(translated, payload);
        }
    }

    function trackGameMessage() {
        if (typeof Window_Message === 'undefined' || !Window_Message || !Window_Message.prototype) {
            diag('[GameMessage] Window_Message unavailable; skipping message hooks.');
            return {
                status: 'skipped',
                reason: 'Window_Message is unavailable.',
            };
        }

        const trackedMessageWindows = new Set();
        const fallbackMessageState = {
            currentText: '',
            isActive: false,
            lastUpdate: 0,
            session: 0,
            source: null,
        };
        const hasTextTracker = () => textTracker
            && typeof textTracker.detect === 'function'
            && (typeof textTracker.isEnabled !== 'function' || textTracker.isEnabled());
        const getMessageScreenState = (windowInstance) => {
            if (!windowInstance) return 'removed';
            if (windowInstance.visible === false) return 'hidden';
            const openness = Number(windowInstance.openness);
            if (Number.isFinite(openness) && openness <= 0) return 'closed';
            const contentsOpacity = Number(windowInstance.contentsOpacity);
            if (Number.isFinite(contentsOpacity) && contentsOpacity <= 0) return 'transparent';
            return 'visible';
        };
        const messageHasQueuedText = (windowInstance) => {
            const gameMessage = getGameMessageForWindow(windowInstance);
            let checkedGameMessage = false;
            try {
                if (gameMessage && typeof gameMessage.hasText === 'function') {
                    checkedGameMessage = true;
                    return !!gameMessage.hasText();
                }
            } catch (_) {}
            try {
                if (gameMessage && typeof gameMessage.allText === 'function') {
                    checkedGameMessage = true;
                    return !!String(gameMessage.allText() || '').trim();
                }
            } catch (_) {}
            if (checkedGameMessage) return false;
            try {
                const state = windowInstance && windowInstance._trGameMessageState;
                if (state && typeof state.currentText === 'string' && state.currentText.trim()) {
                    return true;
                }
            } catch (_) {}
            return false;
        };
        const markRecordDisappeared = (recordId, reason, details = null) => {
            if (!textTracker || !recordId) return;
            if (typeof textTracker.disappear === 'function') {
                textTracker.disappear(recordId, reason, details);
            } else if (typeof textTracker.stale === 'function') {
                textTracker.stale(recordId, reason, details);
            }
        };
        const getMessageWindowId = (windowInstance) => {
            if (!windowInstance) return 'fallback';
            if (!windowInstance._uniqueId) {
                try { windowInstance._uniqueId = Math.random().toString(36).substring(2, 11); } catch (_) {}
            }
            return windowInstance._uniqueId || 'message-window';
        };

        const staleMessageRecord = (windowInstance, reason, details = null) => {
            if (!hasTextTracker() || !windowInstance || !windowInstance._trMessageTrackerRecordId) return;
            markRecordDisappeared(windowInstance._trMessageTrackerRecordId, reason || 'message-stale', Object.assign({
                windowType: windowInstance && windowInstance.constructor ? windowInstance.constructor.name : 'Window_Message',
                screenState: getMessageScreenState(windowInstance),
                seenVisible: !!windowInstance._trMessageTrackerSeenVisible,
            }, details || {}));
            windowInstance._trMessageTrackerRecordId = null;
            windowInstance._trMessageTrackerPayload = null;
            windowInstance._trMessageTrackerSessionId = null;
            windowInstance._trMessageTrackerSeenVisible = false;
            windowInstance._trMessageTrackerOnScreen = false;
            windowInstance._trMessageTrackerScreenState = null;
        };

        const updateMessageRecordVisibility = (windowInstance, screenState, options = {}) => {
            if (!hasTextTracker() || !windowInstance || !windowInstance._trMessageTrackerRecordId) return;
            const nextScreenState = options.opening ? 'opening' : (screenState || getMessageScreenState(windowInstance));
            const onScreen = nextScreenState === 'visible';
            if (windowInstance._trMessageTrackerScreenState === nextScreenState
                && windowInstance._trMessageTrackerOnScreen === onScreen) {
                return;
            }
            windowInstance._trMessageTrackerScreenState = nextScreenState;
            windowInstance._trMessageTrackerOnScreen = onScreen;
            if (onScreen) {
                windowInstance._trMessageTrackerSeenVisible = true;
            }
            if (textTracker && typeof textTracker.update === 'function') {
                textTracker.update(windowInstance._trMessageTrackerRecordId, {
                    onScreen,
                    screenState: nextScreenState,
                }, {
                    type: onScreen ? 'surface.visible' : 'surface.offscreen',
                    message: nextScreenState,
                    details: {
                        windowType: windowInstance && windowInstance.constructor ? windowInstance.constructor.name : 'Window_Message',
                        screenState: nextScreenState,
                        opening: !!options.opening,
                    },
                });
            }
        };

        const detectMessageRecord = (windowInstance, payload, sessionId) => {
            if (!hasTextTracker() || !windowInstance || !payload) return '';
            const recordId = `message:${getMessageWindowId(windowInstance)}:${sessionId}`;
            const screenState = getMessageScreenState(windowInstance);
            const onScreen = screenState === 'visible';
            windowInstance._trMessageTrackerRecordId = recordId;
            windowInstance._trMessageTrackerPayload = payload;
            windowInstance._trMessageTrackerSessionId = sessionId;
            windowInstance._trMessageTrackerSeenVisible = onScreen;
            windowInstance._trMessageTrackerOnScreen = onScreen;
            windowInstance._trMessageTrackerScreenState = screenState;
            textTracker.detect({
                id: recordId,
                hook: 'message',
                hookLabel: 'Game Message',
                surfaceType: 'window',
                status: 'pending',
                rawText: payload.resolved || '',
                convertedText: payload.resolved || '',
                visibleText: payload.visible || '',
                original: payload.visible || '',
                translationSource: payload.translationSource || '',
                normalizedSource: payload.normalizedTranslationSource || '',
                onScreen,
                screenState,
                x: windowInstance._trMsgStartX || 0,
                y: windowInstance._trMsgStartY || 0,
                windowType: windowInstance && windowInstance.constructor ? windowInstance.constructor.name : 'Window_Message',
                metadata: {
                    sessionId,
                },
            });
            return recordId;
        };

        const describeTranslationSkip = (text, fallbackReason = 'translation filter') => {
            const normalized = String(text || '').trim();
            try {
                if (translationCache && typeof translationCache.describeSkip === 'function') {
                    const info = translationCache.describeSkip(normalized) || {};
                    return Object.assign({ reason: info.reason || fallbackReason }, info);
                }
            } catch (_) {}
            return { reason: fallbackReason, length: normalized.length };
        };

        const detectSkippedMessageRecord = (windowInstance, payload, sessionId, reason, details = null) => {
            if (!hasTextTracker() || !windowInstance || !payload || !payload.visible) return '';
            const recordId = `message:${getMessageWindowId(windowInstance)}:${sessionId}:skip`;
            const screenState = getMessageScreenState(windowInstance);
            const onScreen = screenState === 'visible';
            windowInstance._trMessageTrackerRecordId = recordId;
            windowInstance._trMessageTrackerPayload = payload;
            windowInstance._trMessageTrackerSessionId = sessionId;
            windowInstance._trMessageTrackerSeenVisible = onScreen;
            windowInstance._trMessageTrackerOnScreen = onScreen;
            windowInstance._trMessageTrackerScreenState = screenState;
            textTracker.detect({
                id: recordId,
                hook: 'message',
                hookLabel: 'Game Message',
                surfaceType: 'window',
                status: 'skipped',
                rawText: payload.resolved || '',
                convertedText: payload.resolved || '',
                visibleText: payload.visible || '',
                original: payload.visible || '',
                translationSource: payload.translationSource || '',
                normalizedSource: payload.normalizedTranslationSource || '',
                onScreen,
                screenState,
                x: windowInstance._trMsgStartX || 0,
                y: windowInstance._trMsgStartY || 0,
                windowType: windowInstance && windowInstance.constructor ? windowInstance.constructor.name : 'Window_Message',
                metadata: {
                    sessionId,
                },
            });
            textTracker.skip(recordId, reason || 'translation filter', Object.assign({ sessionId }, details || {}));
            return recordId;
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
            staleMessageRecord(windowInstance, 'message-session-replaced');
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
            staleMessageRecord(windowInstance, 'message-cleared');
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
            windowInstance._trMessageTrackerPayload = null;
            windowInstance._trMessageTrackerSessionId = null;
            windowInstance._trMessageTrackerSeenVisible = false;
            windowInstance._trMessageTrackerOnScreen = false;
            windowInstance._trMessageTrackerScreenState = null;
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
                ? String(gameMessage.allText())
                : '';
            if (!gameMessageOriginAwareLineBreaks) {
                return {
                    text: typeof windowInstance.convertEscapeCharacters === 'function'
                        ? windowInstance.convertEscapeCharacters(rawAll)
                        : rawAll,
                    messageBreakInfo: null,
                    rawText: rawAll,
                };
            }
            if (typeof windowInstance.convertEscapeCharacters !== 'function') {
                const rawBreaks = rawAll.match(GAME_MESSAGE_RAW_BREAK_PATTERN) || [];
                return {
                    text: rawAll,
                    messageBreakInfo: {
                        originAware: true,
                        hadHardMessageBreaks: rawBreaks.length > 0,
                        hardBreakCount: rawBreaks.length,
                    },
                    rawText: rawAll,
                };
            }

            // Compatibility note:
            // This origin-aware pass intentionally calls convertEscapeCharacters()
            // after the real startMessage() conversion already ran. Most plugins
            // treat conversion as idempotent text processing, but custom plugins
            // can attach side effects there (alignment state, tag consumption,
            // counters, cached layout, etc.). If a game depends on exactly one
            // conversion pass, leave settings.gameMessage.originAwareLineBreaks
            // disabled to use the older converted-text path.
            const breakMap = createGameMessageBreakMap(rawAll);
            try {
                const markedConverted = windowInstance.convertEscapeCharacters(breakMap.markedText);
                const normalized = normalizeConvertedGameMessageText(markedConverted, breakMap);
                if (normalized.reliable) {
                    return {
                        text: normalized.text,
                        messageBreakInfo: normalized.messageBreakInfo,
                        rawText: rawAll,
                    };
                }
            } catch (error) {
                logger.warn('[GameMessage] Origin-aware message conversion failed; using normal converted text.', error);
            }

            return {
                text: windowInstance.convertEscapeCharacters(rawAll),
                messageBreakInfo: null,
                rawText: rawAll,
            };
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

        const installMessageLifecycleHooks = (Ctor) => {
            if (!Ctor || !Ctor.prototype) return;
            const staleMessageRecordIfOffscreen = (windowInstance, reason) => {
                const screenState = getMessageScreenState(windowInstance);
                if (screenState === 'visible') {
                    updateMessageRecordVisibility(windowInstance, screenState);
                    return;
                }
                const hasPendingText = messageHasQueuedText(windowInstance);
                if (hasPendingText && !windowInstance._trMessageTrackerSeenVisible) {
                    updateMessageRecordVisibility(windowInstance, screenState, { opening: true });
                    return;
                }
                staleMessageRecord(windowInstance, reason || `message-window-${screenState}`, {
                    screenState,
                    hasPendingText,
                });
            };
            ['close', 'hide', 'destroy'].forEach((methodName) => {
                const current = Ctor.prototype[methodName];
                if (typeof current !== 'function' || current.__trGameMessageLifecycleWrapped) return;
                const originalLifecycle = current;
                Ctor.prototype[methodName] = function(...args) {
                    staleMessageRecord(this, `message-window-${methodName}`);
                    return originalLifecycle.apply(this, args);
                };
                Ctor.prototype[methodName].__trOriginal = originalLifecycle;
                Ctor.prototype[methodName].__trGameMessageLifecycleWrapped = true;
            });
            const currentUpdate = Ctor.prototype.update;
            if (typeof currentUpdate === 'function'
                && !currentUpdate.__trGameMessageLifecycleWrapped) {
                const originalUpdate = currentUpdate;
                Ctor.prototype.update = function(...args) {
                    const result = originalUpdate.apply(this, args);
                    staleMessageRecordIfOffscreen(this, 'message-window-offscreen');
                    return result;
                };
                Ctor.prototype.update.__trOriginal = originalUpdate;
                Ctor.prototype.update.__trGameMessageLifecycleWrapped = true;
            }
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

                    const resolvedInfo = getResolvedTextForWindow(this);
                    const resolved = resolvedInfo && typeof resolvedInfo.text === 'string' ? resolvedInfo.text : '';
                    const payload = createEscapeAwarePayload(resolved, 'start', {
                        messageBreakInfo: resolvedInfo && resolvedInfo.messageBreakInfo,
                    });
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
                installMessageLifecycleHooks(Ctor);
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
                    const resolvedInfo = getResolvedTextForWindow(this);
                    const hasResolvedText = resolvedInfo
                        && typeof resolvedInfo.text === 'string'
                        && resolvedInfo.text.length > 0;
                    const resolved = hasResolvedText
                        ? resolvedInfo.text
                        : sourceText;
                    this._trCurrentMessagePayload = createEscapeAwarePayload(resolved, 'processCharacter', {
                        messageBreakInfo: hasResolvedText && resolvedInfo.messageBreakInfo,
                    });
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
                const skipDetails = !normalizedSource
                    ? { reason: 'emptyNormalized', length: 0 }
                    : describeTranslationSkip(normalizedSource);
                diag(`[GameMessage] Skipping translation: "${preview(payload.visible)}"`);
                detectSkippedMessageRecord(
                    this,
                    payload,
                    sessionId,
                    skipDetails.reason || (!normalizedSource ? 'empty normalized source' : 'translation filter'),
                    skipDetails
                );
                return;
            }

            if (telemetry && typeof telemetry.logTextDetected === 'function') {
                telemetry.logTextDetected('message', payload.visible, 0, 0, {
                    windowType: this && this.constructor ? this.constructor.name : 'Window_Message',
                });
            }

            this._trSessionId = sessionId;
            const recordId = detectMessageRecord(this, payload, sessionId);

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
                // Stream preview diagnostics are disabled because they are too noisy.
                // if (hasTextTracker() && recordId) {
                //     textTracker.update(recordId, {
                //         status: 'translating',
                //         translation: restored,
                //     }, { type: 'translation.stream_preview' });
                // }
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
                    recordId,
                    hook: 'message',
                    onDelta: applyStreamDelta,
                    signal: streamController ? streamController.signal : undefined
                })
                : translationCache.requestTranslation(translationSource, {
                    recordId,
                    hook: 'message',
                });

            translationPromise
                .then(translated => {
                    // Check if session is still valid
                    if (!isSessionCurrent(this, sessionId)) {
                        stopStreamLoop(true);
                        if (hasTextTracker() && recordId) {
                            markRecordDisappeared(recordId, 'message-session-expired', { sessionId });
                        }
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
                        if (hasTextTracker() && recordId) {
                            textTracker.skip(recordId, 'restored text empty');
                        }
                        dbg('[GameMessage Skip] Restored text empty after stripping; keeping original.');
                        return;
                    }

                    if (restoredVisible === payload.visible) {
                        stopStreamLoop(true);
                        restoreOriginalAfterStreamPreview();
                        if (hasTextTracker() && recordId) {
                            textTracker.skip(recordId, 'translated text matched original');
                        }
                        dbg(`[GameMessage Skip] Original and translated text are identical: "${preview(payload.visible)}"`);
                        return;
                    }

                    stopStreamLoop(true);
                    dbg(`[GameMessage] Translation: "${preview(payload.visible)}" -> "${preview(restoredVisible)}"`);
                    if (hasTextTracker() && recordId) {
                        textTracker.complete(recordId, restored, {
                            source: 'message',
                            sessionId,
                            translationReceived: translated,
                        });
                        textTracker.draw(recordId, 'redraw', {
                            windowType: this && this.constructor ? this.constructor.name : 'Window_Message',
                            translationDrawn: restored,
                        });
                    }
                    redrawMessageText(this, restored, sessionId);
                })
                .catch(err => {
                    stopStreamLoop(true);
                    if (isAbortErrorLike(err)) return;
                    restoreOriginalAfterStreamPreview();
                    if (hasTextTracker() && recordId) {
                        textTracker.fail(recordId, err && err.message ? err.message : String(err || 'translation error'));
                    }
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

        return {
            status: 'installed',
            reason: 'Window_Message and Game_Message hooks installed.',
        };
    }

        const result = trackGameMessage() || {
            status: 'installed',
            reason: 'Window_Message and Game_Message hook phase completed.',
        };
        result.helpers = {
            drawMessageFaceIfNeeded,
            redrawGameMessageText,
            resolveMessageStartCoordinates,
        };
        return result;
    }

    defineRuntimeModule('hooks.gameMessage', {
        install: installGameMessageHook,
    });
})();
