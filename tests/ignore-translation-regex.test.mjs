import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const managerFile = path.join(repoRoot, 'live-translator-installer', 'translation-manager.js');

function loadTranslationManager() {
    const modules = {};
    const sandbox = {
        console,
        Date,
        Error,
        JSON,
        Map,
        Math,
        Number,
        Object,
        Promise,
        RegExp,
        Set,
        String,
        performance: { now: () => Date.now() },
        LiveTranslatorModules: modules,
        LiveTranslatorDefine(name, value) {
            modules[name] = value;
        },
    };
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(managerFile, 'utf8'), sandbox, { filename: managerFile });
    return modules['runtime.translationManager'];
}

function createTranslationCache(settings, options = {}) {
    const managerModule = loadTranslationManager();
    const translatedTexts = [];
    const trackerEvents = [];
    const telemetryEvents = [];
    const warnings = [];
    const resultPrefix = options.resultPrefix || 'translated:';

    const manager = managerModule.createTranslationManager({
        logger: {
            warn(message) { warnings.push(String(message)); },
            error() {},
            info() {},
        },
        telemetry: {
            logTranslation(...args) { telemetryEvents.push(args); },
        },
        diskCache: { enabled: false },
        textProcessor: {
            async translateText(text) {
                translatedTexts.push(text);
                return `${resultPrefix}${text}`;
            },
        },
        isLocalProvider: true,
        settings,
        textTracker: {
            translationEvent(...args) { trackerEvents.push(args); },
            decision() {},
        },
        diag() {},
    });

    return {
        cache: manager.translationCache,
        translatedTexts,
        trackerEvents,
        telemetryEvents,
        warnings,
    };
}

test('ignoreTranslationRegex skips before cache and provider lookup', async () => {
    const { cache, translatedTexts, trackerEvents } = createTranslationCache({
        translation: { disableCjkFilter: true },
        ignoreTranslationRegex: ['^SYSTEM:'],
    });
    cache.completed.set('SYSTEM: Save', 'cached translation');

    assert.equal(cache.shouldSkip('SYSTEM: Save'), false);
    assert.equal(cache.completed.has('SYSTEM: Save'), false);

    const result = await cache.requestTranslation('SYSTEM: Save', {
        recordId: 'record-1',
        hook: 'message',
    });

    assert.equal(result, 'SYSTEM: Save');
    assert.deepEqual(translatedTexts, []);

    const skipEvent = trackerEvents.find(([event]) => event === 'skip');
    assert.ok(skipEvent, 'expected a tracker skip event');
    assert.equal(skipEvent[2], 'ignoreTranslationRegex');
    assert.equal(skipEvent[3].regex, '/^SYSTEM:/u');
    assert.equal(skipEvent[3].regexTarget, 'trimmedTranslationSource');
});

test('slash-form flags are supported without stateful regex flags', async () => {
    const { cache, translatedTexts } = createTranslationCache({
        translation: { disableCjkFilter: true },
        ignoreTranslationRegex: ['/^system:/i'],
    });

    const result = await cache.requestTranslation('SYSTEM: Config', { recordId: 'record-2' });

    assert.equal(result, 'SYSTEM: Config');
    assert.deepEqual(translatedTexts, []);
    assert.equal(cache.describeIgnoreTranslationRegex('SYSTEM: Config').regex, '/^system:/iu');
});

test('existing non-regex skip filters do not bypass completed cache entries', async () => {
    const { cache, translatedTexts, trackerEvents } = createTranslationCache({
        translation: { disableCjkFilter: false },
        ignoreTranslationRegex: [],
    });
    cache.completed.set('Hello', 'cached:Hello');

    const result = await cache.requestTranslation('Hello', { recordId: 'record-3' });

    assert.equal(result, 'cached:Hello');
    assert.deepEqual(translatedTexts, []);
    assert.ok(trackerEvents.some(([event]) => event === 'cache_hit'));
    assert.ok(!trackerEvents.some(([event]) => event === 'skip'));
});

test('invalid ignore regex entries warn and do not block translation', async () => {
    const { cache, translatedTexts, warnings } = createTranslationCache({
        translation: { disableCjkFilter: true },
        ignoreTranslationRegex: ['[', '/foo/g'],
    });

    const result = await cache.requestTranslation('Hello', { recordId: 'record-4' });

    assert.equal(result, 'translated:Hello');
    assert.deepEqual(translatedTexts, ['Hello']);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /not a valid JavaScript regex/u);
    assert.match(warnings[1], /unsupported flags "g"/u);
});
