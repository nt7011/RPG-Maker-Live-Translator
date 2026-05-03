import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const windowDrawHooksFile = path.join(repoRoot, 'live-translator-installer', 'hooks', 'window-draw-hooks.js');

class FakeCanvasContext {
    constructor(operations) {
        this.operations = operations;
    }

    save() {
        this.operations.push('clip:save');
    }

    restore() {
        this.operations.push('clip:restore');
    }

    beginPath() {
        this.operations.push('clip:beginPath');
    }

    rect(x, y, width, height) {
        this.operations.push(`clip:rect:${x},${y},${width},${height}`);
    }

    clip() {
        this.operations.push('clip:clip');
    }
}

class FakeContents {
    constructor() {
        this.width = 240;
        this.height = 96;
        this.fontSize = 24;
        this.outlineWidth = 0;
        this.clearRects = [];
        this.clearCount = 0;
        this.operations = [];
        this._context = new FakeCanvasContext(this.operations);
    }

    clearRect(x, y, width, height) {
        this.clearRects.push({ x, y, width, height });
        this.operations.push(`clearRect:${x},${y},${width},${height}`);
    }

    clear() {
        this.clearCount += 1;
        this.operations.push('clear');
    }

    measureTextWidth(value) {
        return String(value || '').length * 10;
    }
}

function createClasses() {
    class Window_Base {
        constructor() {
            this.contents = new FakeContents();
            this.visible = true;
            this.openness = 255;
            this.contentsOpacity = 255;
            this.drawnTexts = [];
        }

        drawText(text, x, y, maxWidth, align) {
            this.drawnTexts.push({ text: String(text), x, y, maxWidth, align });
            this.contents.operations.push(`drawText:${String(text)}`);
            return String(text);
        }

        drawTextEx(text, x, y) {
            this.drawnTexts.push({ text: String(text), x, y, maxWidth: Infinity, align: 'left' });
            this.contents.operations.push(`drawTextEx:${String(text)}`);
            return String(text).length;
        }

        isOpen() {
            return true;
        }

        lineHeight() {
            return 36;
        }

        textWidth(value) {
            return String(value || '').length * 10;
        }
    }

    class Window_Selectable extends Window_Base {}

    class Window_CustomPane extends Window_Selectable {
        constructor() {
            super();
            this.refreshCount = 0;
        }

        refresh() {
            this.refreshCount += 1;
            this.contents.clear();
        }
    }

    class Window_ItemList extends Window_Selectable {
        constructor() {
            super();
            this.refreshCount = 0;
        }

        refresh() {
            this.refreshCount += 1;
        }
    }

    return {
        Window_Base,
        Window_Selectable,
        Window_CustomPane,
        Window_ItemList,
    };
}

function createReplayApi() {
    const states = new WeakMap();
    const rectFromDimensions = (x, y, width, height) => ({
        x1: Number(x),
        y1: Number(y),
        x2: Number(x) + Number(width),
        y2: Number(y) + Number(height),
    });
    const overlaps = (a, b) => a && b && a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
    return {
        __token: 'liveTranslator.bitmapReplay',
        ensureBitmapState(bitmap) {
            let state = states.get(bitmap);
            if (!state) {
                state = {
                    renderOps: [],
                    entries: new Map(),
                    drawOrderCounter: 0,
                };
                states.set(bitmap, state);
            }
            return state;
        },
        getBitmapState(bitmap) {
            return states.get(bitmap) || null;
        },
        nextDrawOrder(state) {
            state.drawOrderCounter = (state.drawOrderCounter || 0) + 1;
            return state.drawOrderCounter;
        },
        collectReplayItems(state, rect, currentEntry, relation) {
            return state.renderOps
                .filter((op) => op && op.rect && overlaps(rect, op.rect) && relation(op.drawOrder || 0))
                .map((op) => ({ type: 'renderOp', drawOrder: op.drawOrder || 0, op }));
        },
        replayBitmapItems(bitmap, items) {
            items.forEach((item) => {
                if (item && item.type === 'renderOp' && item.op) {
                    bitmap.operations.push(`replay:${item.op.methodName}`);
                }
            });
        },
        withBitmapReplay(bitmap, fn) {
            bitmap.operations.push('replay:start');
            try {
                return fn();
            } finally {
                bitmap.operations.push('replay:end');
            }
        },
        rectFromDimensions,
        isValidRect(rect) {
            return !!(rect && [rect.x1, rect.y1, rect.x2, rect.y2].every(Number.isFinite));
        },
    };
}

function loadWindowDrawHooks(classes, replayApi = null) {
    const modules = {};
    const sandbox = {
        console,
        Date,
        Error,
        Infinity,
        Map,
        Math,
        Number,
        Object,
        Promise,
        RegExp,
        Set,
        String,
        WeakMap,
        Window_Base: classes.Window_Base,
        Window_Selectable: classes.Window_Selectable,
        LiveTranslatorBitmapReplay: replayApi,
        LiveTranslatorModules: modules,
        LiveTranslatorDefine(name, value) {
            modules[name] = value;
        },
    };
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(windowDrawHooksFile, 'utf8'), sandbox, {
        filename: windowDrawHooksFile,
    });

    return modules['hooks.windowDraw'];
}

function createInstallContext(translatedText = 'translated text', options = {}) {
    const windowRegistry = new WeakMap();
    const registeredWindows = new Set();
    const telemetryEvents = [];
    const context = {
        logger: {
            warn() {},
            error(error) { throw error; },
            debug() {},
            trace() {},
        },
        telemetry: {
            logTextDetected(...args) { telemetryEvents.push(['detected', ...args]); },
            logDraw(...args) { telemetryEvents.push(['draw', ...args]); },
        },
        telemetryEvents,
        textTracker: null,
        translationCache: {
            completed: new Map(),
            shouldSkip() { return false; },
            requestTranslation(value) {
                if (typeof options.requestTranslation === 'function') {
                    return options.requestTranslation(value);
                }
                return Promise.resolve(translatedText);
            },
        },
        windowRegistry,
        registeredWindows,
        ensureWindowRegistered(window) {
            let data = windowRegistry.get(window);
            if (!data) {
                data = {
                    texts: new Map(),
                    isOpen: true,
                    pendingRedraws: new Map(),
                    recentlyRedrawn: new Map(),
                    windowType: window.constructor.name,
                    windowId: window._uniqueId || (window._uniqueId = 'window-1'),
                    contentsBitmap: window.contents,
                };
                windowRegistry.set(window, data);
                registeredWindows.add(window);
            }
            data.contentsBitmap = window.contents;
            return data;
        },
        generateKey(type, x, y, windowType, text) {
            return [type, x, y, String(text || '').trim()].join('|');
        },
        captureBitmapDrawState(contents) {
            return contents ? {
                fontSize: contents.fontSize,
                outlineWidth: contents.outlineWidth,
            } : null;
        },
        applyBitmapDrawState() {},
        resolveTextScalePercent() { return 100; },
        createWindowTextScaleScope() { return { restore() {} }; },
        preview(value) { return String(value ?? ''); },
        REDRAW_SIGNATURE: '\uE100',
        diag() {},
        dbg() {},
        settings: {},
        stripRpgmEscapes(value) { return String(value || ''); },
        prepareTextForTranslation(value) {
            return {
                textForTranslation: String(value || ''),
                original: String(value || ''),
                controlCodes: [],
            };
        },
        restoreControlCodes(value) { return value; },
    };
    return context;
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

const countOperations = (operations, expected) => operations.filter((item) => item === expected).length;

test('repeated drawTextEx text at different positions remains independently active and redraws', async () => {
    const classes = createClasses();
    const module = loadWindowDrawHooks(classes);
    const context = createInstallContext('translated repeated text');
    module.install(context);

    const pane = new classes.Window_CustomPane();
    pane.drawTextEx('same repeated text', 12, 8);
    pane.drawTextEx('same repeated text', 12, 44);
    pane.drawTextEx('same repeated text', 12, 80);
    await flushPromises();

    const data = context.windowRegistry.get(pane);
    assert.equal(data.texts.size, 3);
    const entries = Array.from(data.texts.values());
    assert.deepEqual(entries.map((entry) => entry.translationStatus), [
        'completed',
        'completed',
        'completed',
    ]);
    assert.ok(entries.every((entry) => !entry._trPendingInvalidation && !entry._trStale));
    assert.equal(countOperations(pane.contents.operations, 'drawTextEx:translated repeated text'), 3);
});

test('async translation clips shared replay instead of redrawing skipped counters outside the clear area', async () => {
    const classes = createClasses();
    const replayApi = createReplayApi();
    const module = loadWindowDrawHooks(classes, replayApi);
    const context = createInstallContext('translated option', {
        requestTranslation(value) {
            if (value === '100') return Promise.reject(new Error('numeric text should not be translated'));
            return Promise.resolve('translated option');
        },
    });
    module.install(context);

    const pane = new classes.Window_CustomPane();
    const replayState = replayApi.ensureBitmapState(pane.contents);
    replayState.renderOps.push({
        methodName: 'fillRect',
        rect: replayApi.rectFromDimensions(0, 0, 180, 36),
        drawOrder: replayApi.nextDrawOrder(replayState),
    });
    pane.drawText('100', 8, 8, 80, 'left');
    pane.drawText('source option', 120, 8, 160, 'left');
    await flushPromises();

    assert.equal(pane.refreshCount, 0);
    assert.ok(pane.drawnTexts.some((item) => item.text === 'translated option'));
    assert.equal(pane.contents.clearRects.length, 1);
    const data = context.windowRegistry.get(pane);
    const numericEntry = Array.from(data.texts.values()).find((entry) => entry.convertedText === '100');
    assert.ok(numericEntry);
    assert.equal(numericEntry.translationStatus, 'skipped');
    assert.equal(numericEntry.skipReason, 'counterLike');
    assert.equal(countOperations(pane.contents.operations, 'drawText:100'), 1);
    assert.ok(pane.contents.operations.includes('replay:fillRect'));
    assert.deepEqual(pane.contents.operations.slice(-12), [
        'replay:start',
        'clearRect:120,8,120,36',
        'clip:save',
        'clip:beginPath',
        'clip:rect:120,8,120,36',
        'clip:clip',
        'replay:fillRect',
        'clip:restore',
        'replay:end',
        'replay:start',
        'drawText:translated option',
        'replay:end',
    ]);
});

test('async translation still replays skipped counters intersecting the clear area', async () => {
    const classes = createClasses();
    const replayApi = createReplayApi();
    const module = loadWindowDrawHooks(classes, replayApi);
    const context = createInstallContext('translated option');
    module.install(context);

    const pane = new classes.Window_CustomPane();
    pane.drawText('100', 112, 8, 80, 'left');
    pane.drawText('source option', 120, 8, 160, 'left');
    await flushPromises();

    assert.equal(pane.refreshCount, 0);
    assert.equal(countOperations(pane.contents.operations, 'drawText:100'), 2);
    assert.ok(pane.contents.operations.includes('clip:rect:120,8,120,36'));
    assert.deepEqual(pane.contents.operations.slice(-12), [
        'replay:start',
        'clearRect:120,8,120,36',
        'clip:save',
        'clip:beginPath',
        'clip:rect:120,8,120,36',
        'clip:clip',
        'drawText:100',
        'clip:restore',
        'replay:end',
        'replay:start',
        'drawText:translated option',
        'replay:end',
    ]);
});

test('async translation still allows refresh on core RPG Maker selectable windows', async () => {
    const classes = createClasses();
    const module = loadWindowDrawHooks(classes);
    const context = createInstallContext('translated item');
    module.install(context);

    const list = new classes.Window_ItemList();
    list.drawText('source item', 8, 8, 160, 'left');
    await flushPromises();

    assert.equal(list.refreshCount, 1);
});
