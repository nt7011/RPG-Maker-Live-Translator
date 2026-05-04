import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const trackerFile = path.join(repoRoot, 'live-translator-installer', 'runtime', 'text-tracker.js');

function loadTextTracker() {
    const modules = {};
    const sandbox = {
        Date,
        JSON,
        Map,
        Math,
        Number,
        Object,
        Promise,
        RegExp,
        Set,
        String,
        clearTimeout,
        setTimeout,
        LiveTranslatorGuiState: { translatorOpen: true },
        LiveTranslatorModules: modules,
        LiveTranslatorDefine(name, value) {
            modules[name] = value;
        },
    };
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(trackerFile, 'utf8'), sandbox, { filename: trackerFile });
    return modules['runtime.textTracker'];
}

test('failed translation events keep error text out of translation field', () => {
    const trackerModule = loadTextTracker();
    const tracker = trackerModule.createTextTracker({
        logger: { debug() {} },
    });

    tracker.detect({
        id: 'message:failed',
        hook: 'message',
        text: 'source text',
    });
    tracker.translationEvent('error', 'source text', 'The user aborted a request.', {
        recordId: 'message:failed',
        hook: 'message',
    });

    const snapshot = tracker.snapshot();
    assert.equal(snapshot.active[0].status, 'failed');
    assert.equal(snapshot.active[0].translation, '');
    assert.equal(snapshot.active[0].translationReceived, '');
    assert.equal(snapshot.active[0].decisions.at(-1).details.resultPreview, 'The user aborted a request.');
});
