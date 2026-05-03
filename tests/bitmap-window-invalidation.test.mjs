import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const invalidationFile = path.join(repoRoot, 'live-translator-installer', 'hooks', 'bitmap', 'invalidation.js');

function loadBitmapInvalidation() {
    const modules = {};

    class Bitmap {
        constructor(name = '') {
            this.name = name;
            this.width = 120;
            this.height = 48;
        }

        clearRect(x, y, width, height) {
            this.lastClearRect = { x, y, width, height };
        }

        clear() {
            this.cleared = true;
        }

        destroy() {
            this.destroyed = true;
        }
    }

    const sandbox = {
        console,
        Date,
        Error,
        Math,
        Number,
        Object,
        Set,
        String,
        WeakMap,
        Bitmap,
        LiveTranslatorModules: modules,
        LiveTranslatorDefine(name, value) {
            modules[name] = value;
        },
    };
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(invalidationFile, 'utf8'), sandbox, {
        filename: invalidationFile,
    });

    return {
        Bitmap: sandbox.Bitmap,
        module: modules['hooks.bitmap.invalidation'],
    };
}

function rectFromDimensions(x, y, width, height) {
    const x1 = Number(x);
    const y1 = Number(y);
    const w = Number(width);
    const h = Number(height);
    if (![x1, y1, w, h].every(Number.isFinite)) return null;
    return { x1, y1, x2: x1 + w, y2: y1 + h };
}

function isValidRect(rect) {
    return !!(rect
        && [rect.x1, rect.y1, rect.x2, rect.y2].every((value) => Number.isFinite(Number(value))));
}

function rectanglesOverlap(a, b) {
    if (!isValidRect(a) || !isValidRect(b)) return false;
    return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

function createRuntime() {
    const trackerEvents = [];
    return {
        bitmapStates: new WeakMap(),
        contentsOwners: new WeakMap(),
        windowRegistry: new WeakMap(),
        trackerEvents,
        perf: {
            count() {},
            top() {},
            isEnabled() { return false; },
            now() { return 0; },
            time() {},
        },
        telemetry: {
            logDraw() {},
        },
        textTracker: {
            disappear(id, reason, details) {
                trackerEvents.push({ id, reason, details });
            },
            stale(id, reason, details) {
                trackerEvents.push({ id, reason, details });
            },
        },
        logger: {
            warn() {},
        },
        diag() {},
        diagHot() {},
        preview(value) { return String(value ?? ''); },
        shouldCaptureBitmapCallSites() { return false; },
        captureBitmapCallSite() { return ''; },
        shouldTraceBitmapDiagnostics() { return false; },
        isSmallTextScratchBitmap() { return false; },
        isSmallTextDrawActive() { return false; },
        describeBitmap(bitmap) { return bitmap && bitmap.name ? `bitmap=${bitmap.name}` : 'bitmap'; },
        deriveEntryRect(entry) { return entry && entry.bounds ? entry.bounds : null; },
        formatRect(rect) { return isValidRect(rect) ? `${rect.x1},${rect.y1},${rect.x2},${rect.y2}` : 'n/a'; },
        rectanglesOverlap,
        rectanglesSimilar() { return false; },
        rectFromDimensions,
        rectHasArea(rect) {
            return isValidRect(rect) && rect.x2 > rect.x1 && rect.y2 > rect.y1;
        },
        isValidRect,
        fragmentRect(fragment) { return fragment && fragment.bounds ? fragment.bounds : null; },
        discardRenderOpsInRect() {},
        recordBitmapRenderOp() {},
        markEntryStale(state, entry, reason) {
            if (entry) entry._trStale = true;
            if (state && state.entries && entry && entry.key) state.entries.delete(entry.key);
            if (reason) entry.canceledReason = reason;
        },
        flushAggregatedLines() {},
    };
}

class Window_CustomPane {
    constructor(contents) {
        this.contents = contents;
    }
}

function attachWindowEntry(runtime, owner, data, bitmap, key = 'row') {
    runtime.contentsOwners.set(bitmap, owner);
    runtime.windowRegistry.set(owner, data);
    const entry = {
        recordId: `record-${key}`,
        contentsBitmap: bitmap,
        bounds: { x1: 8, y1: 8, x2: 64, y2: 32 },
        translationStatus: 'completed',
    };
    data.texts.set(key, entry);
    return entry;
}

test('destroying a stale window contents bitmap does not retire entries drawn on current contents', () => {
    const { Bitmap, module } = loadBitmapInvalidation();
    const runtime = createRuntime();
    module.attach(runtime);

    const oldContents = new Bitmap('old');
    const currentContents = new Bitmap('current');
    const owner = new Window_CustomPane(currentContents);
    const data = {
        texts: new Map(),
        pendingRedraws: new Map(),
        recentlyRedrawn: new Map(),
        contentsBitmap: currentContents,
        windowType: 'Window_CustomPane',
    };

    runtime.contentsOwners.set(oldContents, owner);
    attachWindowEntry(runtime, owner, data, currentContents);

    oldContents.destroy();

    assert.equal(data.texts.size, 1);
    assert.equal(runtime.trackerEvents.length, 0);
});

test('destroying an old contents bitmap still retires entries drawn on that bitmap', () => {
    const { Bitmap, module } = loadBitmapInvalidation();
    const runtime = createRuntime();
    module.attach(runtime);

    const oldContents = new Bitmap('old');
    const currentContents = new Bitmap('current');
    const owner = new Window_CustomPane(currentContents);
    const data = {
        texts: new Map(),
        pendingRedraws: new Map(),
        recentlyRedrawn: new Map(),
        contentsBitmap: currentContents,
        windowType: 'Window_CustomPane',
    };

    runtime.contentsOwners.set(currentContents, owner);
    const entry = attachWindowEntry(runtime, owner, data, oldContents);

    oldContents.destroy();

    assert.equal(data.texts.size, 0);
    assert.equal(entry._trStale, true);
    assert.equal(runtime.trackerEvents[0].reason, 'destroy-contents');
});

test('current contents clearRect still retires overlapping window entries', () => {
    const { Bitmap, module } = loadBitmapInvalidation();
    const runtime = createRuntime();
    module.attach(runtime);

    const currentContents = new Bitmap('current');
    const owner = new Window_CustomPane(currentContents);
    const data = {
        texts: new Map(),
        pendingRedraws: new Map(),
        recentlyRedrawn: new Map(),
        contentsBitmap: currentContents,
        windowType: 'Window_CustomPane',
    };
    const entry = attachWindowEntry(runtime, owner, data, currentContents);

    currentContents.clearRect(0, 0, 80, 40);

    assert.equal(data.texts.size, 0);
    assert.equal(entry._trStale, true);
    assert.equal(entry.translationStatus, 'stale');
    assert.equal(runtime.trackerEvents[0].reason, 'clearRect-contents');
});
