import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const launcherFile = path.join(repoRoot, 'live-translator-installer', 'ui-launcher.js');

function createTimers() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();

    function setTimeoutFake(fn, delay = 0) {
        const id = nextId;
        nextId += 1;
        timers.set(id, {
            id,
            fn,
            time: now + Math.max(0, Number(delay) || 0),
        });
        return id;
    }

    function clearTimeoutFake(id) {
        timers.delete(id);
    }

    function tick(ms = 0) {
        const end = now + Math.max(0, Number(ms) || 0);
        while (true) {
            const due = Array.from(timers.values())
                .filter((timer) => timer.time <= end)
                .sort((a, b) => (a.time - b.time) || (a.id - b.id))[0];
            if (!due) break;
            timers.delete(due.id);
            now = due.time;
            due.fn();
        }
        now = end;
    }

    return {
        setTimeout: setTimeoutFake,
        clearTimeout: clearTimeoutFake,
        tick,
    };
}

function createNwWindow() {
    const handlers = {};
    return {
        handlers,
        focusCount: 0,
        resize: null,
        position: null,
        on(event, handler) {
            handlers[event] = handler;
        },
        focus() {
            this.focusCount += 1;
        },
        resizeTo(width, height) {
            this.resize = { width, height };
        },
        moveTo(x, y) {
            this.position = { x, y };
        },
        close() {
            if (handlers.closed) handlers.closed();
        },
    };
}

function loadLauncher({ nwOpen, settings = {} }) {
    const timers = createTimers();
    const events = {};
    const currentScript = {
        src: 'file:///C:/Game/js/plugins/live-translator/ui-launcher.js',
        getAttribute(name) {
            return name === 'src' ? this.src : '';
        },
    };
    const sandbox = {
        Date,
        Math,
        Number,
        Object,
        String,
        URL,
        console: {
            warn() {},
        },
        document: {
            currentScript,
            readyState: 'complete',
            addEventListener(type, handler) {
                events[type] = handler;
            },
        },
        location: {
            href: 'file:///C:/Game/index.html',
        },
        screen: {
            availWidth: 1920,
            availHeight: 1080,
            availLeft: 0,
            availTop: 0,
        },
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        window: null,
        __LiveTranslatorUiLauncherTestOptions: {
            openCallbackTimeoutMs: 10,
            defaultLaunchRetryMs: 5,
        },
        LiveTranslatorSettings: settings,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.nw = {
        Screen: {
            Init() {},
            screens: [
                { work_area: { x: 0, y: 0, width: 1920, height: 1080 } },
            ],
        },
        Window: {
            open: nwOpen,
        },
    };

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(launcherFile, 'utf8'), sandbox, { filename: launcherFile });
    return { sandbox, timers, events };
}

test('startup GUI launch retries when NW open never reports a window', () => {
    let attempts = 0;
    const openedWindows = [];
    const { sandbox, timers } = loadLauncher({
        nwOpen(_url, _options, callback) {
            attempts += 1;
            if (attempts === 1) return undefined;
            const win = createNwWindow();
            openedWindows.push(win);
            callback(win);
            return undefined;
        },
    });

    timers.tick(0);
    assert.equal(attempts, 1);
    assert.equal(sandbox.LiveTranslatorGuiState.translatorOpen, false);

    timers.tick(10);

    assert.equal(attempts, 2);
    assert.equal(openedWindows.length, 1);
    assert.equal(sandbox.LiveTranslatorGuiState.translatorOpen, true);
    assert.equal(sandbox.LiveTranslatorGui.isOpen(), true);
});

test('startup retry stops if the GUI reports itself open before the NW callback arrives', () => {
    let attempts = 0;
    const { sandbox, timers } = loadLauncher({
        nwOpen() {
            attempts += 1;
            return undefined;
        },
    });

    timers.tick(0);
    assert.equal(attempts, 1);

    sandbox.LiveTranslatorGuiState.translatorOpen = true;
    timers.tick(20);

    assert.equal(attempts, 1);
    assert.equal(sandbox.LiveTranslatorGuiState.translatorOpen, true);
    assert.equal(sandbox.LiveTranslatorGui.isOpen(), true);
});

test('stale closed GUI handles do not block reopening', () => {
    let attempts = 0;
    const openedWindows = [];
    const { sandbox, timers } = loadLauncher({
        nwOpen(_url, _options, callback) {
            attempts += 1;
            const win = createNwWindow();
            openedWindows.push(win);
            callback(win);
            return undefined;
        },
    });

    timers.tick(0);
    assert.equal(attempts, 1);
    assert.equal(sandbox.LiveTranslatorGuiState.translatorOpen, true);

    sandbox.LiveTranslatorGuiState.translatorOpen = false;
    sandbox.LiveTranslatorGui.open({ focus: true });

    assert.equal(attempts, 2);
    assert.equal(openedWindows.length, 2);
    assert.equal(sandbox.LiveTranslatorGuiState.translatorOpen, true);
});

test('disableGuiAutoLaunch suppresses startup launch but preserves hotkey opening', () => {
    let attempts = 0;
    const openedWindows = [];
    const { sandbox, timers, events } = loadLauncher({
        settings: { disableGuiAutoLaunch: true },
        nwOpen(_url, _options, callback) {
            attempts += 1;
            const win = createNwWindow();
            openedWindows.push(win);
            callback(win);
            return undefined;
        },
    });

    timers.tick(20);
    assert.equal(attempts, 0);
    assert.equal(sandbox.LiveTranslatorGuiState.translatorOpen, false);

    let prevented = false;
    events.keydown({
        ctrlKey: true,
        shiftKey: true,
        key: 'Enter',
        code: 'Enter',
        target: { tagName: 'body' },
        preventDefault() {
            prevented = true;
        },
    });

    assert.equal(prevented, true);
    assert.equal(attempts, 1);
    assert.equal(openedWindows.length, 1);
    assert.equal(sandbox.LiveTranslatorGuiState.translatorOpen, true);
});
