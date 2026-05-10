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

function loadGameMessageHook(MessageWindowClass, globals = {}) {
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
        ...globals,
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

function createTextTrackerRecorder() {
    const calls = {
        detect: [],
        update: [],
        disappear: [],
        stale: [],
        complete: [],
        draw: [],
    };
    return {
        calls,
        tracker: {
            isEnabled() { return true; },
            detect(input) {
                calls.detect.push(input);
                return input && input.id ? input.id : '';
            },
            update(id, patch, decision) {
                calls.update.push({ id, patch, decision });
                return null;
            },
            disappear(id, reason, details) {
                calls.disappear.push({ id, reason, details });
                return null;
            },
            stale(id, reason, details) {
                calls.stale.push({ id, reason, details });
                return null;
            },
            complete(id, translation, details) {
                calls.complete.push({ id, translation, details });
                return null;
            },
            draw(id, event, details) {
                calls.draw.push({ id, event, details });
                return null;
            },
        },
    };
}

function attachTrackedMessageRecord(messageWindow, id = 'message:window:1') {
    messageWindow._trMessageTrackerRecordId = id;
    messageWindow._trMessageTrackerPayload = {
        visible: 'source text',
        resolved: 'source text',
        translationSource: 'source text',
        normalizedTranslationSource: 'source text',
    };
    messageWindow._trMessageTrackerSessionId = 1;
    messageWindow._trMessageTrackerSeenVisible = true;
    messageWindow._trMessageTrackerOnScreen = true;
    messageWindow._trMessageTrackerScreenState = 'visible';
    messageWindow._trGameMessageState = {
        currentText: 'source text',
        isActive: true,
        lastUpdate: Date.now(),
        session: 1,
        source: null,
    };
}

function installGameMessageHook(options = {}) {
    const MessageWindowClass = options.MessageWindowClass || createFakeMessageWindowClass();
    const context = options.context || createInstallContext();
    const result = loadGameMessageHook(MessageWindowClass, options.globals).install(context);
    return {
        result,
        helpers: result.helpers,
        MessageWindowClass,
    };
}

function activateMessageSession(messageWindow, session = 1) {
    messageWindow._trGameMessageState = {
        currentText: '',
        isActive: true,
        lastUpdate: Date.now(),
        session,
        source: null,
    };
    messageWindow._trMessageSession = session;
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

test('game message streaming still previews when no incompatible message plugin is present', () => {
    const calls = { stream: 0, nonStream: 0 };
    const context = createInstallContext();
    context.translationCache = {
        completed: new Map(),
        shouldSkip() { return false; },
        requestTranslation() {
            calls.nonStream += 1;
            return Promise.resolve('final text');
        },
        requestTranslationStream(_value, options = {}) {
            calls.stream += 1;
            if (typeof options.onDelta === 'function') options.onDelta('partial text');
            return Promise.resolve('final text');
        },
    };
    const { MessageWindowClass } = installGameMessageHook({ context });
    const messageWindow = new MessageWindowClass({ width: 200, height: 72 });
    activateMessageSession(messageWindow, 1);

    messageWindow.processCompleteMessage('source text', 1);

    assert.equal(calls.stream, 1);
    assert.equal(calls.nonStream, 0);
    assert.equal(messageWindow._trStreamPreviewBlocked, false);
    assert.equal(messageWindow._trStreamText, 'partial text');
    assert.equal(messageWindow._trStreamDirty, true);
});

test('message window close does not archive a record while the window is still visible', () => {
    const recorder = createTextTrackerRecorder();
    const context = createInstallContext();
    context.textTracker = recorder.tracker;
    const { MessageWindowClass } = installGameMessageHook({ context });
    const messageWindow = new MessageWindowClass({ width: 200, height: 72 });
    attachTrackedMessageRecord(messageWindow);

    messageWindow.close();

    assert.equal(recorder.calls.disappear.length, 0);
    assert.equal(recorder.calls.stale.length, 0);
    assert.equal(messageWindow._trMessageTrackerRecordId, 'message:window:1');
});

test('message window close archives a record once the close makes it offscreen', () => {
    const MessageWindowClass = createFakeMessageWindowClass();
    MessageWindowClass.prototype.close = function() {
        this.openness = 0;
    };
    const recorder = createTextTrackerRecorder();
    const context = createInstallContext();
    context.textTracker = recorder.tracker;
    const { MessageWindowClass: InstalledClass } = installGameMessageHook({
        MessageWindowClass,
        context,
    });
    const messageWindow = new InstalledClass({ width: 200, height: 72 });
    attachTrackedMessageRecord(messageWindow);

    messageWindow.close();

    assert.equal(recorder.calls.disappear.length, 1);
    assert.equal(recorder.calls.disappear[0].reason, 'message-window-close');
    assert.equal(recorder.calls.disappear[0].details.screenState, 'closed');
    assert.equal(messageWindow._trMessageTrackerRecordId, null);
});

test('Game_Message.clear keeps a visible message session drawable', async () => {
    class FakeGameMessage {
        constructor(text) {
            this._text = text;
        }

        allText() {
            return this._text;
        }

        hasText() {
            return !!this._text;
        }

        clear() {
            this._text = '';
        }
    }

    let resolveTranslation;
    const gameMessage = new FakeGameMessage('source text');
    const recorder = createTextTrackerRecorder();
    const context = createInstallContext();
    context.textTracker = recorder.tracker;
    context.translationCache = {
        completed: new Map(),
        shouldSkip() { return false; },
        requestTranslation() {
            return new Promise((resolve) => {
                resolveTranslation = resolve;
            });
        },
    };
    const { MessageWindowClass } = installGameMessageHook({
        context,
        globals: {
            Game_Message: FakeGameMessage,
            $gameMessage: gameMessage,
        },
    });
    const messageWindow = new MessageWindowClass({ width: 200, height: 72 });
    messageWindow._gameMessage = gameMessage;
    context.registeredWindows.add(messageWindow);
    activateMessageSession(messageWindow, 1);

    messageWindow.processCompleteMessage('source text', 1);
    gameMessage.clear();

    assert.equal(recorder.calls.disappear.length, 0);
    assert.equal(messageWindow._trGameMessageState.isActive, true);
    assert.equal(messageWindow._trGameMessageState.session, 1);

    resolveTranslation('translated text');
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(messageWindow.drawnText, 'translated text');
    assert.equal(recorder.calls.complete.length, 1);
    assert.equal(recorder.calls.draw.length, 1);
});

test('MPP_MessageEX_Op3 bypasses game message stream preview and uses one final redraw', async () => {
    const MessageWindowClass = createFakeMessageWindowClass();
    MessageWindowClass.prototype.accumulateLine = function() {};
    MessageWindowClass.prototype.updateAccumulation = function() { return false; };
    MessageWindowClass.prototype.createAccumulatedBitmap = function() {};

    const calls = { stream: 0, nonStream: 0, delta: 0 };
    const context = createInstallContext();
    context.translationCache = {
        completed: new Map(),
        shouldSkip() { return false; },
        requestTranslation() {
            calls.nonStream += 1;
            return Promise.resolve('final text');
        },
        requestTranslationStream(_value, options = {}) {
            calls.stream += 1;
            if (typeof options.onDelta === 'function') {
                calls.delta += 1;
                options.onDelta('partial text');
            }
            return Promise.resolve('final text');
        },
    };
    const { MessageWindowClass: InstalledClass } = installGameMessageHook({
        MessageWindowClass,
        context,
        globals: {
            PluginManager: { _scripts: ['MPP_MessageEX_Op3'] },
            $plugins: [{ name: 'MPP_MessageEX_Op3', status: true }],
        },
    });
    const messageWindow = new InstalledClass({ width: 200, height: 72 });
    activateMessageSession(messageWindow, 1);

    messageWindow.processCompleteMessage('source text', 1);
    await Promise.resolve();

    assert.equal(calls.stream, 0);
    assert.equal(calls.nonStream, 1);
    assert.equal(calls.delta, 0);
    assert.equal(messageWindow._trStreamPreviewBlocked, true);
    assert.equal(messageWindow._trStreamLoopActive, false);
    assert.equal(messageWindow._trStreamText, '');
    assert.equal(messageWindow.drawnText, 'final text');
});
