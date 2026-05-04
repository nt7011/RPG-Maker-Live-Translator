import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const gameMessageHookFile = path.join(repoRoot, 'live-translator-installer', 'hooks', 'game-message-hook.js');

function createFakeMessageWindowClass() {
    return class FakeMessageWindow {
        constructor({ width = 40, height = 72 } = {}) {
            this.visible = true;
            this.openness = 255;
            this.contentsOpacity = 255;
            this.pause = false;
            this._waitCount = 0;
            this.drawnText = '';
            this.pageCount = 0;
            this.clearCount = 0;
            this.contents = {
                width,
                height,
                fontSize: 28,
                clear: () => {
                    this.clearCount += 1;
                },
                measureTextWidth: (value) => this.textWidth(value),
            };
        }

        createContents() {
            return this.contents;
        }

        lineHeight() {
            return 36;
        }

        textWidth(value) {
            return String(value || '').length * 10;
        }

        resetFontSettings() {
            this.contents.fontSize = 28;
        }

        newLineX() {
            return 0;
        }

        createTextState(text, x, y) {
            return {
                text: String(text || ''),
                index: 0,
                x,
                y,
                startX: x,
                startY: y,
                left: x,
                height: this.lineHeight(),
                buffer: '',
            };
        }

        newPage(textState) {
            this.pageCount += 1;
            this.contents.clear();
            if (textState) {
                textState.x = this.newLineX(textState);
                textState.y = 0;
                textState.startX = textState.x;
                textState.left = textState.x;
                textState.height = this.lineHeight();
            }
        }

        processCharacter(textState) {
            const character = textState.text.charAt(textState.index);
            textState.index += 1;
            if (character === '\n') {
                this.processNewLine(textState);
                return;
            }
            if (character === '\f') {
                this.newPage(textState);
                return;
            }
            this.drawnText += character;
            textState.x += this.textWidth(character);
        }

        processNewLine(textState) {
            textState.x = this.newLineX(textState);
            textState.y += textState.height || this.lineHeight();
            textState.height = this.lineHeight();
            if (this.needsNewPage(textState)) {
                this.pause = true;
            }
        }

        needsNewPage(textState) {
            return !this.isEndOfText(textState)
                && textState.y + textState.height > this.contents.height;
        }

        isEndOfText(textState) {
            return !textState || textState.index >= String(textState.text || '').length;
        }

        isWaiting() {
            return this.pause || this._waitCount > 0;
        }

        onEndOfText() {
            this.ended = true;
            this._textState = null;
        }

        isAnySubWindowActive() {
            return false;
        }

        updatePlacement() {}
        updateBackground() {}
        open() {}
        isOpen() { return true; }
        update() {}
        close() {}
        hide() {}
        destroy() {}
    };
}

function loadGameMessageHook(MessageWindowClass) {
    const modules = {};
    const sandbox = {
        console,
        Date,
        Error,
        Math,
        Number,
        Object,
        Promise,
        RegExp,
        Set,
        String,
        WeakMap,
        Window_Message: MessageWindowClass,
        LiveTranslatorModules: modules,
        LiveTranslatorDefine(name, value) {
            modules[name] = value;
        },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(gameMessageHookFile, 'utf8'), sandbox, {
        filename: gameMessageHookFile,
    });
    return modules['hooks.gameMessage'];
}

function createInstallContext() {
    return {
        logger: {
            warn() {},
            error() {},
            debug() {},
            trace() {},
            shouldLog() { return false; },
        },
        dbg() {},
        diag() {},
        preview(value) { return String(value || ''); },
        stripRpgmEscapes(value) { return String(value || ''); },
        prepareTextForTranslation(value) {
            return {
                textForTranslation: String(value || ''),
                controlCodes: [],
                newlineData: null,
                original: String(value || ''),
            };
        },
        restoreControlCodes(value) { return value; },
        telemetry: {
            logTextDetected() {},
            logDraw() {},
        },
        textTracker: null,
        translationCache: {
            completed: new Map(),
            shouldSkip() { return false; },
            requestTranslation(value) { return Promise.resolve(value); },
        },
        settings: {
            gameMessage: {
                textScale: 100,
                originAwareLineBreaks: false,
            },
        },
        captureBitmapDrawState() { return null; },
        applyBitmapDrawState() {},
        generateKey() { return 'key'; },
        contentsOwners: new WeakMap(),
        windowRegistry: new WeakMap(),
        registeredWindows: new Set(),
        PER_CHAR_MARK: '',
        REDRAW_SIGNATURE: '\uE100',
        logEscape() {},
    };
}

function installGameMessageHook() {
    const MessageWindowClass = createFakeMessageWindowClass();
    return {
        helpers: loadGameMessageHook(MessageWindowClass).install(createInstallContext()).helpers,
        MessageWindowClass,
    };
}

test('game message redraw does not synthesize soft wraps in one-line windows', () => {
    const { helpers, MessageWindowClass } = installGameMessageHook();
    const messageWindow = new MessageWindowClass({ width: 40, height: 36 });

    assert.equal(helpers.redrawGameMessageText(messageWindow, 'ABCDEFGH'), true);

    assert.equal(messageWindow._trWrappedMessageText, 'ABCDEFGH');
    assert.equal(messageWindow.pause, false);
    assert.equal(messageWindow.drawnText, 'ABCDEFGH');
});

test('game message redraw still soft-wraps when the window can show another line', () => {
    const { helpers, MessageWindowClass } = installGameMessageHook();
    const messageWindow = new MessageWindowClass({ width: 40, height: 72 });

    assert.equal(helpers.redrawGameMessageText(messageWindow, 'ABCDEFGH'), true);

    assert.equal(messageWindow._trWrappedMessageText, 'ABCD\nEFGH');
    assert.equal(messageWindow.pause, false);
    assert.equal(messageWindow.drawnText, 'ABCDEFGH');
});

test('game message redraw preserves authored hard breaks in one-line windows', () => {
    const { helpers, MessageWindowClass } = installGameMessageHook();
    const messageWindow = new MessageWindowClass({ width: 80, height: 36 });

    assert.equal(helpers.redrawGameMessageText(messageWindow, 'AB\nCD'), true);

    assert.equal(messageWindow._trWrappedMessageText, 'AB\nCD');
    assert.equal(messageWindow.pause, true);
    assert.equal(messageWindow.drawnText, 'AB');
});
