import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const spriteTextHookFile = path.join(repoRoot, 'live-translator-installer', 'hooks', 'sprite-text-hook.js');

function loadSpriteTextHook() {
    const modules = {};

    class Bitmap {
        constructor(width = 1, height = 1) {
            this.width = width;
            this.height = height;
            this.fontFace = 'GameFont';
            this.fontSize = 24;
            this.fontBold = false;
            this.fontItalic = false;
            this.textColor = '#ffffff';
            this.outlineColor = 'rgba(0, 0, 0, 0.5)';
            this.outlineWidth = 4;
            this.operations = [];
        }

        drawText(text, x, y, maxWidth, lineHeight, align) {
            this.operations.push({
                methodName: 'drawText',
                text: String(text),
                x,
                y,
                maxWidth,
                lineHeight,
                align,
            });
            return text;
        }

        blt(source, sx, sy, sw, sh, dx, dy, dw, dh) {
            this.operations.push({
                methodName: 'blt',
                sourceName: source && source.name ? source.name : '',
                sx,
                sy,
                sw,
                sh,
                dx,
                dy,
                dw,
                dh,
            });
        }

        clearRect(x, y, width, height) {
            this.operations.push({ methodName: 'clearRect', x, y, width, height });
        }

        measureTextWidth(value) {
            return String(value || '').length * 12;
        }
    }

    class Sprite {
        constructor(bitmap = null) {
            this._bitmap = null;
            this.children = [];
            this.parent = null;
            this.x = 0;
            this.y = 0;
            this.z = 0;
            this.zIndex = 0;
            this.alpha = 1;
            this.opacity = 255;
            this.visible = true;
            this.renderable = true;
            this.scale = { x: 1, y: 1 };
            this.anchor = { x: 0, y: 0 };
            this._frame = { x: 0, y: 0, width: 1, height: 1 };
            if (bitmap) this.bitmap = bitmap;
        }

        get bitmap() {
            return this._bitmap;
        }

        set bitmap(value) {
            this._bitmap = value;
        }

        addChild(child) {
            return this.addChildAt(child, this.children.length);
        }

        addChildAt(child, index) {
            if (!child) return child;
            if (child.parent && child.parent !== this && typeof child.parent.removeChild === 'function') {
                child.parent.removeChild(child);
            }
            const existingIndex = this.children.indexOf(child);
            if (existingIndex >= 0) this.children.splice(existingIndex, 1);
            const safeIndex = Math.max(0, Math.min(Number(index) || 0, this.children.length));
            this.children.splice(safeIndex, 0, child);
            child.parent = this;
            return child;
        }

        removeChild(child) {
            const index = this.children.indexOf(child);
            if (index >= 0) this.children.splice(index, 1);
            if (child && child.parent === this) child.parent = null;
            return child;
        }

        render() {}
        renderWebGL() {}
        renderCanvas() {}
    }

    const sandbox = {
        console,
        Date,
        Error,
        Math,
        Number,
        Object,
        String,
        Array,
        Map,
        Set,
        WeakMap,
        Bitmap,
        Sprite,
        LiveTranslatorModules: modules,
        LiveTranslatorDefine(name, module) {
            modules[name] = module;
        },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(spriteTextHookFile, 'utf8'), sandbox, {
        filename: spriteTextHookFile,
    });

    return {
        Bitmap: sandbox.Bitmap,
        Sprite: sandbox.Sprite,
        sandbox,
        module: modules['hooks.spriteText'],
    };
}

function installSpriteText(runtime, translation = 'ID card') {
    const completed = new Map([['ID\u30ab\u30fc\u30c9', translation]]);
    runtime.module.install({
        logger: {
            warn() {},
            error() {},
        },
        diag() {},
        preview(value) {
            return String(value ?? '');
        },
        stripRpgmEscapes(value) {
            return String(value ?? '');
        },
        prepareTextForTranslation(value) {
            return { textForTranslation: String(value ?? '') };
        },
        restoreControlCodes(value) {
            return value;
        },
        captureBitmapDrawState(bitmap) {
            return {
                fontFace: bitmap.fontFace,
                fontSize: bitmap.fontSize,
                fontBold: bitmap.fontBold,
                fontItalic: bitmap.fontItalic,
                textColor: bitmap.textColor,
                outlineColor: bitmap.outlineColor,
                outlineWidth: bitmap.outlineWidth,
            };
        },
        applyBitmapDrawState(bitmap, state) {
            if (!bitmap || !state) return;
            Object.assign(bitmap, state);
        },
        translationCache: {
            completed,
            shouldSkip() {
                return false;
            },
            requestTranslation(value) {
                return Promise.resolve(completed.get(String(value ?? '').trim()) || value);
            },
        },
        settings: {},
    });
}

function installSpriteTextWithOptions(runtime, options = {}) {
    const completed = options.completed || new Map();
    const requests = [];
    runtime.module.install({
        logger: {
            warn() {},
            error() {},
        },
        diag() {},
        preview(value) {
            return String(value ?? '');
        },
        stripRpgmEscapes(value) {
            return String(value ?? '');
        },
        prepareTextForTranslation(value) {
            return { textForTranslation: String(value ?? '') };
        },
        restoreControlCodes(value) {
            return value;
        },
        captureBitmapDrawState(bitmap) {
            return {
                fontFace: bitmap.fontFace,
                fontSize: bitmap.fontSize,
                fontBold: bitmap.fontBold,
                fontItalic: bitmap.fontItalic,
                textColor: bitmap.textColor,
                outlineColor: bitmap.outlineColor,
                outlineWidth: bitmap.outlineWidth,
            };
        },
        applyBitmapDrawState(bitmap, state) {
            if (!bitmap || !state) return;
            Object.assign(bitmap, state);
        },
        translationCache: {
            completed,
            shouldSkip() {
                return false;
            },
            requestTranslation(value) {
                const normalized = String(value ?? '').trim();
                requests.push(normalized);
                return Promise.resolve(completed.get(normalized) || normalized);
            },
        },
        settings: {},
        textTracker: options.textTracker || null,
    });
    return { requests };
}

function addGlyph(runtime, parent, text, x) {
    const bitmap = new runtime.Bitmap(24, 32);
    const sprite = new runtime.Sprite();
    sprite.x = x;
    parent.addChild(sprite);
    sprite.bitmap = bitmap;
    runtime.sandbox.LiveTranslatorSpriteTextHook.recordBitmapDrawText({
        bitmap,
        text,
        x: 0,
        y: 0,
        maxWidth: 24,
        lineHeight: 32,
        align: 'left',
        drawState: {
            fontFace: 'GameFont',
            fontSize: 24,
            fontBold: false,
            fontItalic: false,
            textColor: '#ffffff',
            outlineColor: 'rgba(0, 0, 0, 0.5)',
            outlineWidth: 4,
        },
    });
    return sprite;
}

test('sprite overlay replays image paint drawn before first text draw', () => {
    const runtime = loadSpriteTextHook();
    installSpriteText(runtime, 'ID card');

    const parent = new runtime.Sprite();
    const sprite = new runtime.Sprite();
    const bitmap = new runtime.Bitmap(180, 32);
    const icon = new runtime.Bitmap(32, 32);
    icon.name = 'item-icon';

    parent.addChild(sprite);
    sprite.bitmap = bitmap;

    bitmap.blt(icon, 0, 0, 32, 32, 0, 0, 32, 32);
    runtime.sandbox.LiveTranslatorSpriteTextHook.recordBitmapDrawText({
        bitmap,
        text: 'ID\u30ab\u30fc\u30c9',
        x: 43,
        y: 0,
        maxWidth: 120,
        lineHeight: 32,
        align: 'left',
        drawState: {
            fontFace: 'GameFont',
            fontSize: 24,
            fontBold: false,
            fontItalic: false,
            textColor: '#ffffff',
            outlineColor: 'rgba(0, 0, 0, 0.5)',
            outlineWidth: 4,
        },
    });

    runtime.sandbox.LiveTranslatorSpriteTextHook.flushFrame('test');

    const overlay = parent.children.find((child) => child !== sprite);
    assert.ok(overlay, 'expected translated overlay sprite to be attached');
    assert.equal(overlay.bitmap._trSpriteTextOverlayBitmap, true);
    assert.deepEqual(
        overlay.bitmap.operations.map((operation) => operation.methodName),
        ['blt', 'drawText']
    );
    assert.equal(overlay.bitmap.operations[0].sourceName, 'item-icon');
    assert.equal(overlay.bitmap.operations[1].text, 'ID card');
});

test('sprite run supersedes an earlier same-slot prefix when a longer run appears', () => {
    const runtime = loadSpriteTextHook();
    const trackerEvents = [];
    const { requests } = installSpriteTextWithOptions(runtime, {
        completed: new Map(),
        textTracker: {
            isEnabled() {
                return true;
            },
            detect(payload) {
                trackerEvents.push({ type: 'detect', text: payload && payload.original });
            },
            upsert(payload) {
                trackerEvents.push({ type: 'upsert', text: payload && payload.original });
            },
            disappear(id, reason, details) {
                trackerEvents.push({ type: 'disappear', reason, text: details && details.supersededByText });
            },
            decision() {},
            complete() {},
            draw() {},
            skip() {},
            fail() {},
        },
    });

    const parent = new runtime.Sprite();
    addGlyph(runtime, parent, 'B', 0);
    addGlyph(runtime, parent, 'a', 12);
    runtime.sandbox.LiveTranslatorSpriteTextHook.flushFrame('prefix');

    addGlyph(runtime, parent, 'd', 24);
    addGlyph(runtime, parent, 'S', 36);
    addGlyph(runtime, parent, 't', 48);
    addGlyph(runtime, parent, 'a', 60);
    addGlyph(runtime, parent, 't', 72);
    addGlyph(runtime, parent, 'u', 84);
    addGlyph(runtime, parent, 's', 96);
    runtime.sandbox.LiveTranslatorSpriteTextHook.flushFrame('complete');

    assert.deepEqual(requests, ['Ba', 'BadStatus']);
    assert.deepEqual(
        trackerEvents.filter((event) => event.type === 'detect').map((event) => event.text),
        ['Ba', 'BadStatus']
    );
    assert.ok(
        trackerEvents.some((event) => event.type === 'disappear'
            && event.reason === 'sprite-run-superseded'
            && event.text === 'BadStatus'),
        'expected previous prefix record to be marked as superseded by the longer run'
    );
});
