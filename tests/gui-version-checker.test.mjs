import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appFile = path.join(repoRoot, 'live-translator-installer', 'gui', 'app.js');
const requireFromTest = createRequire(import.meta.url);

function loadGuiTestApi() {
    const supportPath = fs.mkdtempSync(path.join(os.tmpdir(), 'live-translator-gui-'));
    fs.writeFileSync(path.join(supportPath, 'version.json'), JSON.stringify({ version: '3.2.5' }), 'utf8');
    fs.writeFileSync(path.join(supportPath, 'settings.json'), JSON.stringify({ checkUpdates: false }), 'utf8');

    const pageUrl = new URL(pathToFileURL(path.join(supportPath, 'gui', 'index.html')).href);
    pageUrl.searchParams.set('supportPath', supportPath);

    const sandbox = {
        AbortController,
        Array,
        Buffer,
        Date,
        Error,
        JSON,
        Math,
        Number,
        Object,
        Promise,
        RegExp,
        Set,
        String,
        TextDecoder,
        URL,
        clearInterval,
        clearTimeout,
        console,
        document: {
            querySelectorAll() {
                return [];
            },
        },
        fetch() {
            throw new Error('unexpected network request');
        },
        process,
        require: requireFromTest,
        setInterval() {
            throw new Error('unexpected update timer');
        },
        setTimeout,
        window: {
            addEventListener() {},
            location: { href: pageUrl.href },
            opener: null,
        },
        __LiveTranslatorGuiExposeTestApi: true,
    };
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(appFile, 'utf8'), sandbox, { filename: appFile });
    fs.rmSync(supportPath, { recursive: true, force: true });
    return sandbox.LiveTranslatorGuiTestApi;
}

test('GUI version parser accepts the shared version.json shape and ignores extra fields', () => {
    const api = loadGuiTestApi();

    assert.equal(
        api.parseVersionPayload('{"version":"3.2.5","downloadUrl":"https://example.test/ignored"}').version,
        '3.2.5'
    );
});

test('GUI version parser rejects unsafe or malformed version strings', () => {
    const api = loadGuiTestApi();

    assert.equal(api.normalizeVersionString(' 3.2.5 '), '3.2.5');
    assert.equal(api.normalizeVersionString('<img src=x onerror=alert(1)>'), '');
    assert.throws(
        () => api.parseVersionPayload('{"version":"<script>alert(1)</script>"}'),
        /valid "version"/u
    );
});

test('GUI update URL validation allows HTTPS redirects but blocks unsafe targets', () => {
    const api = loadGuiTestApi();

    assert.doesNotThrow(() => api.validateVersionCheckUrl(new URL('https://updates.example.net/version.json')));
    assert.throws(() => api.validateVersionCheckUrl(new URL('http://updates.example.net/version.json')), /HTTPS/u);
    assert.throws(() => api.validateVersionCheckUrl(new URL('https://127.0.0.1/version.json')), /not allowed/u);
    assert.throws(() => api.validateVersionCheckUrl(new URL('https://192.168.1.1/version.json')), /not allowed/u);
    assert.throws(() => api.validateVersionCheckUrl(new URL('https://[::1]/version.json')), /not allowed/u);
});
