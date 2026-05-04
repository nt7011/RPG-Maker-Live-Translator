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

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function createAbortError(message = 'The user aborted a request.') {
    const error = new Error(message);
    error.name = 'AbortError';
    error.code = 'ABORT_ERR';
    return error;
}

function createManager(textProcessor) {
    const managerModule = loadTranslationManager();
    return managerModule.createTranslationManager({
        textProcessor,
        isLocalProvider: true,
        diskCache: { enabled: false },
        logger: {
            debug() {},
            info() {},
            warn() {},
            error() {},
        },
        telemetry: { logTranslation() {} },
        settings: { translation: { disableCjkFilter: true } },
        dbg() {},
        diag() {},
    });
}

test('stream abort falls back and resolves joined ongoing requests', async () => {
    const stream = createDeferred();
    const fallbackCalls = [];
    const manager = createManager({
        translateTextStream() {
            return stream.promise;
        },
        translateText(text) {
            fallbackCalls.push(text);
            return Promise.resolve('fallback translation');
        },
    });
    const cache = manager.translationCache;

    const first = cache.requestTranslationStream('source text', { recordId: 'message:1', hook: 'message' });
    const second = cache.requestTranslationStream('source text', { recordId: 'message:2', hook: 'message' });

    stream.reject(createAbortError());

    assert.equal(await first, 'fallback translation');
    assert.equal(await second, 'fallback translation');
    assert.deepEqual(fallbackCalls, ['source text']);
    assert.equal(cache.completed.get('source text'), 'fallback translation');
});
