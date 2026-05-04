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

function countTestIcons(value) {
    const matches = String(value || '').match(/(?:\x1b|\\)i\[[^\]]*\]/gi);
    return matches ? matches.length : 0;
}

function stripTestEscapes(value) {
    return String(value || '').replace(/(?:\x1b|\\)(?:[A-Za-z0-9_#]+|[^\s\w])(?:\[[^\]]*\]|<[^>]*>)?/g, '');
}

function measureTestRichText(value) {
    return stripTestEscapes(value).length * 10 + countTestIcons(value) * 36;
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

        textSizeEx(value) {
            return {
                width: measureTestRichText(value),
                height: this.lineHeight(),
            };
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
        stripRpgmEscapes(value) { return stripTestEscapes(value); },
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

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

const countOperations = (operations, expected) => operations.filter((item) => item === expected).length;

function enableBackgroundSnapshots(contents) {
    const context = contents && contents._context;
    assert.ok(context);
    context.getImageData = (x, y, width, height) => {
        contents.operations.push(`snapshot:get:${x},${y},${width},${height}`);
        return { width, height };
    };
    context.putImageData = (imageData, x, y) => {
        contents.operations.push(`snapshot:put:${x},${y},${imageData.width},${imageData.height}`);
    };
}

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

test('async drawTextEx redraw clears instead of restoring captured snapshots', async () => {
    const classes = createClasses();
    const module = loadWindowDrawHooks(classes);
    const context = createInstallContext('translated rich');
    module.install(context);

    const pane = new classes.Window_CustomPane();
    enableBackgroundSnapshots(pane.contents);

    pane.drawTextEx('rich source', 20, 8);
    await flushPromises();

    assert.deepEqual(pane.contents.clearRects, [
        { x: 20, y: 8, width: 150, height: 36 },
    ]);
    assert.ok(pane.contents.operations.includes('snapshot:get:20,8,110,36'));
    assert.equal(pane.contents.operations.some((item) => item.startsWith('snapshot:put:')), false);
    assert.ok(pane.drawnTexts.some((item) => item.text === 'translated rich'));

    const redrawEvent = context.telemetryEvents.find((event) => event[0] === 'draw' && event[1] === 'redraw');
    assert.ok(redrawEvent);
    const details = redrawEvent[5];
    assert.equal(details.backgroundSnapshot, false);
    assert.equal(details.diagnostics.clearMode, 'clearRect');
    assert.equal(details.diagnostics.snapshot.available, true);
    assert.equal(details.diagnostics.snapshot.restoreAttempted, true);
    assert.equal(details.diagnostics.snapshot.restoreSkippedReason, 'drawTextEx');
    assert.equal(details.diagnostics.snapshot.restoreSucceeded, false);
});

test('async drawTextEx clear bounds include icon escape width when translation is shorter', async () => {
    const classes = createClasses();
    const module = loadWindowDrawHooks(classes);
    const context = createInstallContext('\\i[7]xy');
    module.install(context);

    const pane = new classes.Window_CustomPane();
    pane.drawTextEx('\\i[7]abcdef', 20, 8);
    await flushPromises();

    assert.deepEqual(pane.contents.clearRects, [
        { x: 20, y: 8, width: 96, height: 36 },
    ]);
    assert.ok(pane.drawnTexts.some((item) => item.text === '\\i[7]xy'));

    const redrawEvent = context.telemetryEvents.find((event) => event[0] === 'draw' && event[1] === 'redraw');
    assert.ok(redrawEvent);
    assert.equal(JSON.stringify(redrawEvent[5].diagnostics.originalBounds), JSON.stringify({
        x1: 20,
        y1: 8,
        x2: 116,
        y2: 44,
    }));
});

test('async drawTextEx redraw filters replay ops produced by the original rich text draw', async () => {
    const classes = createClasses();
    const replayApi = createReplayApi();
    classes.Window_Base.prototype.drawTextEx = function(text, x, y) {
        const value = String(text);
        if (value === 'rich source') {
            const state = replayApi.ensureBitmapState(this.contents);
            state.renderOps.push({
                methodName: 'blt',
                rect: replayApi.rectFromDimensions(x, y, 16, 16),
                drawOrder: replayApi.nextDrawOrder(state),
                windowDrawTextExReplay: this.contents._trWindowDrawTextExReplayDepth > 0,
            });
            state.renderOps.push({
                methodName: 'bltImage',
                rect: replayApi.rectFromDimensions(x + 20, y, 80, 36),
                drawOrder: replayApi.nextDrawOrder(state),
                windowDrawTextExReplay: this.contents._trWindowDrawTextExReplayDepth > 0,
            });
        }
        this.drawText(value === 'rich source' ? 'nested original' : value, x, y, 160, 'left');
        this.drawnTexts.push({ text: value, x, y, maxWidth: Infinity, align: 'left' });
        this.contents.operations.push(`drawTextEx:${value}`);
        return value.length;
    };

    const translation = createDeferred();
    const module = loadWindowDrawHooks(classes, replayApi);
    const context = createInstallContext('unused', {
        requestTranslation() {
            return translation.promise;
        },
    });
    module.install(context);

    const pane = new classes.Window_CustomPane();
    pane.drawTextEx('rich source', 20, 8);
    pane.drawTextEx('rich source', 20, 8);
    translation.resolve('translated rich');
    await flushPromises();

    assert.equal(countOperations(pane.contents.operations, 'replay:blt'), 0);
    assert.equal(countOperations(pane.contents.operations, 'replay:bltImage'), 0);
    assert.ok(pane.contents.operations.includes('drawTextEx:translated rich'));
    assert.equal(context.windowRegistry.get(pane).texts.size, 1);

    const redrawEvent = context.telemetryEvents.find((event) => event[0] === 'draw' && event[1] === 'redraw');
    assert.ok(redrawEvent);
    const diagnostics = redrawEvent[5].diagnostics;
    assert.equal(diagnostics.replayBeforeFiltered, 2);
    assert.equal(diagnostics.replayAfterFiltered, 2);
    assert.equal(diagnostics.replayBeforeItems.count, 0);
    assert.equal(diagnostics.replayAfterItems.count, 0);
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

test('async left-aligned drawText clears measured text bounds instead of full slot width', async () => {
    const classes = createClasses();
    const module = loadWindowDrawHooks(classes);
    const context = createInstallContext('bb');
    module.install(context);

    const pane = new classes.Window_CustomPane();
    pane.contents.width = 500;
    pane.drawText('aa', 72, 20, 340, 'left');
    await flushPromises();

    assert.deepEqual(pane.contents.clearRects, [
        { x: 72, y: 20, width: 20, height: 36 },
    ]);
    assert.ok(pane.drawnTexts.some((item) => item.text === 'bb'));
});

test('async right-aligned drawText clears the aligned text position inside maxWidth', async () => {
    const classes = createClasses();
    const module = loadWindowDrawHooks(classes);
    const context = createInstallContext('bbbbbb');
    module.install(context);

    const pane = new classes.Window_CustomPane();
    pane.contents.width = 500;
    pane.drawText('aaaa', 72, 20, 200, 'right');
    await flushPromises();

    assert.deepEqual(pane.contents.clearRects, [
        { x: 212, y: 20, width: 60, height: 36 },
    ]);
    assert.ok(pane.drawnTexts.some((item) => item.text === 'bbbbbb'));
});

test('async redraw restores captured background instead of replaying pre-text pane layers', async () => {
    const classes = createClasses();
    const replayApi = createReplayApi();
    const module = loadWindowDrawHooks(classes, replayApi);
    const context = createInstallContext('bb');
    module.install(context);

    const pane = new classes.Window_CustomPane();
    pane.contents.width = 500;
    enableBackgroundSnapshots(pane.contents);

    const replayState = replayApi.ensureBitmapState(pane.contents);
    replayState.renderOps.push({
        methodName: 'fillRect',
        rect: replayApi.rectFromDimensions(0, 0, 500, 36),
        drawOrder: replayApi.nextDrawOrder(replayState),
    });

    pane.drawText('aa', 72, 5, 340, 'left');
    pane.drawText('aa', 72, 5, 340, 'left');
    await flushPromises();

    const snapshotGets = pane.contents.operations.filter((item) => item.startsWith('snapshot:get:'));
    assert.deepEqual(pane.contents.clearRects, []);
    assert.equal(snapshotGets.length, 1);
    assert.ok(pane.contents.operations.includes('snapshot:get:72,5,20,36'));
    assert.ok(pane.contents.operations.includes('snapshot:put:72,5,20,36'));
    assert.equal(countOperations(pane.contents.operations, 'replay:fillRect'), 0);
    assert.ok(pane.drawnTexts.some((item) => item.text === 'bb'));

    const redrawEvent = context.telemetryEvents.find((event) => event[0] === 'draw' && event[1] === 'redraw');
    assert.ok(redrawEvent);
    const diagnostics = redrawEvent[5].diagnostics;
    assert.equal(diagnostics.clearMode, 'snapshot');
    assert.equal(diagnostics.snapshot.restoreSucceeded, true);
    assert.equal(JSON.stringify(diagnostics.snapshot.area), JSON.stringify({ x: 72, y: 5, w: 20, h: 36 }));
    assert.equal(diagnostics.replayBeforeItems.count, 1);
    assert.equal(diagnostics.replayBeforeItems.methods['op:fillRect'], 1);
    assert.equal(diagnostics.replayAfterItems.count, 0);
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
