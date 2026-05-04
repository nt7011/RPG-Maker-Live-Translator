// Translator monitor window.
// This standalone page is opened by ui-launcher and reads runtime hook installation results from the game window.
(() => {
    'use strict';

    const refs = {};
    const PAST_TEXT_DISPLAY_LIMIT = 100;
    const UNTRACKABLE_TEXT_DISPLAY_LIMIT = 100;
    const VERSION_CHECK_URL = 'https://nt7011.github.io/info/translator-version.json';
    const UPDATE_PAGE_URL = 'https://nt7011.github.io/';
    const VERSION_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;
    const VERSION_CHECK_TIMEOUT_MS = 8000;
    const VERSION_CHECK_MAX_BYTES = 16 * 1024;
    const VERSION_CHECK_MAX_REDIRECTS = 5;
    const state = {
        startedAt: Date.now(),
        heartbeatTimer: null,
        updateCheckTimer: null,
        supportPath: '',
        gameRoot: '',
        translationCacheFile: '',
        installedVersion: '',
        latestVersion: '',
        checkUpdates: true,
        updateCheckStatus: 'loading',
        updateCheckMessage: 'Checking installation',
        updateCheckError: '',
        updateCheckInFlight: false,
        activeTexts: [],
        formerlyActiveTexts: [],
        untrackableTexts: [],
        activeTextRecordDetailKey: '',
        renderedTextRecordDetailKey: '',
        panelHealth: {
            runtimeContext: null,
            hookInstallation: null,
        },
        hookResults: [],
        hookSummary: null,
        textSummary: null,
        logLines: [],
        provider: '-',
        cacheEntries: '-',
    };

    let fs = null;
    let path = null;
    let https = null;
    let dns = null;
    let net = null;

    function initRefs() {
        for (const element of document.querySelectorAll('[id]')) {
            refs[element.id] = element;
        }
    }

    function getNodeRequire() {
        if (typeof require === 'function') return require;
        if (globalThis.nw && typeof nw.require === 'function') return nw.require;
        return null;
    }

    function initNode() {
        const req = getNodeRequire();
        if (!req) return false;
        fs = req('fs');
        path = req('path');
        https = req('https');
        dns = req('dns');
        net = req('net');
        try {
            state.gameRoot = getQueryValue('gameRoot') || (typeof process !== 'undefined' && typeof process.cwd === 'function'
                ? process.cwd()
                : '');
        } catch (_) {
            state.gameRoot = '';
        }
        return true;
    }

    function getQueryValue(name) {
        try {
            return new URL(window.location.href).searchParams.get(name) || '';
        } catch (_) {
            return '';
        }
    }

    function setText(id, value) {
        if (refs[id]) refs[id].textContent = String(value);
    }

    function setStatus(id, tone, value) {
        const el = refs[id];
        if (!el) return;
        el.className = `status ${tone}`;
        el.textContent = value;
    }

    function setSummaryStatus(id, tone, value) {
        const el = refs[id];
        if (!el) return;
        el.className = `summary-status ${tone}`;
        el.textContent = value;
    }

    function formatNumber(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '0';
        return Math.round(numeric).toLocaleString('en-US');
    }

    function formatTime(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleTimeString();
    }

    function formatDuration(ms) {
        const seconds = Math.max(0, Math.floor(Number(ms) / 1000));
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    function isFile(filePath) {
        if (!fs || !filePath) return false;
        try {
            return fs.statSync(filePath).isFile();
        } catch (_) {
            return false;
        }
    }

    function isDirectory(dirPath) {
        if (!fs || !dirPath) return false;
        try {
            return fs.statSync(dirPath).isDirectory();
        } catch (_) {
            return false;
        }
    }

    function readJsonFile(filePath) {
        const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '');
        return JSON.parse(text);
    }

    function normalizeVersionString(value) {
        if (typeof value !== 'string' && typeof value !== 'number') return '';
        const version = String(value).trim();
        if (!version || version.length > 64) return '';
        if (!/^[0-9A-Za-z][0-9A-Za-z._+-]*$/u.test(version)) return '';
        return version;
    }

    function parseVersionPayload(text) {
        const payload = JSON.parse(String(text || '').replace(/^\uFEFF/u, ''));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('version payload must be a JSON object');
        }
        const version = normalizeVersionString(payload.version);
        if (!version) {
            throw new Error('version payload missing a valid "version" string');
        }
        return { version };
    }

    function setVersionStatus(status, message, error = '') {
        state.updateCheckStatus = status;
        state.updateCheckMessage = message;
        state.updateCheckError = error;
    }

    function toneForVersionStatus() {
        if (state.updateCheckStatus === 'latest') return 'ok';
        if (state.updateCheckStatus === 'update'
            || state.updateCheckStatus === 'error'
            || state.updateCheckStatus === 'missing') return 'warn';
        return 'neutral';
    }

    function renderVersionPanel() {
        const indicator = refs['version-indicator'];
        if (indicator) {
            const versionLabel = state.installedVersion ? `Version ${state.installedVersion}` : 'Version unknown';
            indicator.className = `version-indicator ${toneForVersionStatus()}`;
            indicator.textContent = `${versionLabel}: ${state.updateCheckMessage || 'Checking installation'}`;
            indicator.title = state.updateCheckError || '';
        }

        const link = refs['version-update-link'];
        if (link) {
            link.href = UPDATE_PAGE_URL;
            link.hidden = state.updateCheckStatus !== 'update';
            link.textContent = state.latestVersion ? `Update to ${state.latestVersion}` : 'Open installer';
            link.title = 'Open the RPG Maker Live Translator installer page';
        }
    }

    function readInstalledVersion() {
        if (!fs || !path || !state.supportPath) return '';
        const versionFile = path.join(state.supportPath, 'version.json');
        if (!isFile(versionFile)) return '';
        try {
            const payload = readJsonFile(versionFile);
            return normalizeVersionString(payload && payload.version);
        } catch (err) {
            addLog('warn', `version.json read failed: ${formatError(err)}`);
            return '';
        }
    }

    function readCheckUpdatesSetting() {
        if (!fs || !path || !state.supportPath) return true;
        const settingsFile = path.join(state.supportPath, 'settings.json');
        if (!isFile(settingsFile)) return true;
        try {
            const settings = readJsonFile(settingsFile);
            if (!settings || typeof settings !== 'object') return true;
            if (!Object.prototype.hasOwnProperty.call(settings, 'checkUpdates')) return true;
            if (settings.checkUpdates === false) return false;
            if (settings.checkUpdates === true) return true;
            addLog('warn', 'settings.json "checkUpdates" should be a boolean. Defaulting to true.');
            return true;
        } catch (err) {
            addLog('warn', `settings.json read failed for update checks: ${formatError(err)}`);
            return true;
        }
    }

    function refreshVersionSettings() {
        state.installedVersion = readInstalledVersion();
        state.latestVersion = '';
        state.checkUpdates = readCheckUpdatesSetting();
        state.updateCheckError = '';

        if (!state.installedVersion) {
            setVersionStatus('missing', 'Installed version unavailable');
            renderVersionPanel();
            return;
        }

        if (!state.checkUpdates) {
            setVersionStatus('disabled', 'Update checks disabled');
            renderVersionPanel();
            return;
        }

        setVersionStatus('idle', 'Ready to check updates');
        renderVersionPanel();
    }

    async function runUpdateCheck() {
        if (state.updateCheckInFlight || !state.checkUpdates || !state.installedVersion) return;

        state.updateCheckInFlight = true;
        setVersionStatus('checking', 'Checking for updates');
        renderVersionPanel();

        try {
            const remote = await fetchRemoteVersion();
            const wasSameUpdate = state.updateCheckStatus === 'update' && state.latestVersion === remote.version;
            state.latestVersion = remote.version;
            if (state.latestVersion === state.installedVersion) {
                setVersionStatus('latest', 'Current release');
            } else {
                setVersionStatus('update', `Update available (${state.latestVersion})`);
                if (!wasSameUpdate) {
                    addLog('warn', `Update available: installed ${state.installedVersion}, latest ${state.latestVersion}.`);
                }
            }
        } catch (err) {
            state.latestVersion = '';
            setVersionStatus('error', 'Update check failed', formatError(err));
            addLog('warn', `Update check failed: ${formatError(err)}`);
        } finally {
            state.updateCheckInFlight = false;
            renderVersionPanel();
        }
    }

    function startUpdateChecker() {
        refreshVersionSettings();
        if (!state.checkUpdates || !state.installedVersion) return;
        runUpdateCheck();
        state.updateCheckTimer = setInterval(runUpdateCheck, VERSION_CHECK_INTERVAL_MS);
    }

    function stopUpdateChecker() {
        if (state.updateCheckTimer) clearInterval(state.updateCheckTimer);
        state.updateCheckTimer = null;
    }

    async function fetchRemoteVersion() {
        const text = await fetchRemoteText(VERSION_CHECK_URL);
        return parseVersionPayload(text);
    }

    function fetchRemoteText(url) {
        if (https && dns && net) return fetchRemoteTextWithNode(url, 0);
        return fetchRemoteTextWithBrowser(url);
    }

    function fetchRemoteTextWithNode(rawUrl, redirectCount) {
        return new Promise((resolve, reject) => {
            let url;
            try {
                url = new URL(rawUrl);
                validateVersionCheckUrl(url);
            } catch (err) {
                reject(err);
                return;
            }

            let finished = false;
            function finish(err, value) {
                if (finished) return;
                finished = true;
                if (err) reject(err);
                else resolve(value);
            }

            const request = https.request(url, {
                method: 'GET',
                timeout: VERSION_CHECK_TIMEOUT_MS,
                lookup: safeDnsLookup,
                headers: {
                    Accept: 'application/json, text/plain;q=0.8, */*;q=0.1',
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
            }, (response) => {
                const status = Number(response.statusCode) || 0;
                if (isRedirectStatus(status) && response.headers && response.headers.location) {
                    response.resume();
                    if (redirectCount >= VERSION_CHECK_MAX_REDIRECTS) {
                        finish(new Error('too many update check redirects'));
                        return;
                    }
                    let nextUrl;
                    try {
                        nextUrl = new URL(String(response.headers.location), url.href);
                        validateVersionCheckUrl(nextUrl);
                    } catch (err) {
                        finish(err);
                        return;
                    }
                    fetchRemoteTextWithNode(nextUrl.href, redirectCount + 1).then(
                        (value) => finish(null, value),
                        finish
                    );
                    return;
                }

                if (status < 200 || status >= 300) {
                    response.resume();
                    finish(new Error(`HTTP ${status}`));
                    return;
                }

                const chunks = [];
                let total = 0;
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    total += getTextByteLength(chunk);
                    if (total > VERSION_CHECK_MAX_BYTES) {
                        response.destroy();
                        finish(new Error('version response too large'));
                        return;
                    }
                    chunks.push(String(chunk));
                });
                response.on('end', () => finish(null, chunks.join('')));
                response.on('error', finish);
            });

            request.on('timeout', () => request.destroy(new Error('update check timed out')));
            request.on('error', finish);
            request.end();
        });
    }

    async function fetchRemoteTextWithBrowser(rawUrl) {
        if (typeof fetch !== 'function') {
            throw new Error('no network API available');
        }

        const url = new URL(rawUrl);
        validateVersionCheckUrl(url);

        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller
            ? setTimeout(() => controller.abort(), VERSION_CHECK_TIMEOUT_MS)
            : null;
        try {
            const response = await fetch(url.href, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'omit',
                redirect: 'follow',
                referrerPolicy: 'no-referrer',
                signal: controller ? controller.signal : undefined,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            if (response.url) validateVersionCheckUrl(new URL(response.url));
            return await readLimitedResponseText(response);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function readLimitedResponseText(response) {
        if (response.body
            && typeof response.body.getReader === 'function'
            && typeof TextDecoder === 'function') {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            const chunks = [];
            let total = 0;
            try {
                while (true) {
                    const result = await reader.read();
                    if (result.done) break;
                    const value = result.value || new Uint8Array(0);
                    total += Number(value.byteLength || value.length || 0);
                    if (total > VERSION_CHECK_MAX_BYTES) {
                        if (typeof reader.cancel === 'function') reader.cancel();
                        throw new Error('version response too large');
                    }
                    chunks.push(decoder.decode(value, { stream: true }));
                }
                chunks.push(decoder.decode());
                return chunks.join('');
            } finally {
                if (reader.releaseLock) reader.releaseLock();
            }
        }

        const text = await response.text();
        if (getTextByteLength(text) > VERSION_CHECK_MAX_BYTES) {
            throw new Error('version response too large');
        }
        return text;
    }

    function isRedirectStatus(status) {
        return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
    }

    function validateVersionCheckUrl(url) {
        if (!url || url.protocol !== 'https:') {
            throw new Error('update checks require HTTPS');
        }
        if (url.username || url.password) {
            throw new Error('update check URL credentials are not allowed');
        }
        if (isUnsafeHostname(url.hostname)) {
            throw new Error('update check target is not allowed');
        }
    }

    function safeDnsLookup(hostname, options, callback) {
        const cb = typeof options === 'function' ? options : callback;
        const requestOptions = typeof options === 'object' && options ? options : {};
        dns.lookup(hostname, Object.assign({}, requestOptions, { all: true }), (err, addresses) => {
            if (err) {
                cb(err);
                return;
            }
            const list = Array.isArray(addresses) ? addresses : [addresses];
            const allowed = list.filter((entry) => entry && !isUnsafeIpAddress(entry.address || entry));
            if (!allowed.length || allowed.length !== list.length) {
                cb(new Error('update check DNS target is not allowed'));
                return;
            }
            if (requestOptions.all) {
                cb(null, allowed);
                return;
            }
            cb(null, allowed[0].address, allowed[0].family);
        });
    }

    function isUnsafeHostname(hostname) {
        const host = normalizeHostname(hostname);
        if (!host) return true;
        if (host === 'localhost' || host.endsWith('.localhost') || host === 'local' || host.endsWith('.local')) {
            return true;
        }
        if (!net || typeof net.isIP !== 'function') return false;
        return isUnsafeIpAddress(host);
    }

    function normalizeHostname(hostname) {
        return String(hostname || '')
            .trim()
            .replace(/^\[/u, '')
            .replace(/\]$/u, '')
            .replace(/\.$/u, '')
            .toLowerCase();
    }

    function isUnsafeIpAddress(address) {
        if (!net || typeof net.isIP !== 'function') return false;
        const value = normalizeHostname(address);
        const family = net.isIP(value);
        if (family === 4) return isUnsafeIpv4(value);
        if (family === 6) return isUnsafeIpv6(value);
        return false;
    }

    function isUnsafeIpv4(address) {
        const parts = String(address).split('.').map((part) => Number(part));
        if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
            return true;
        }
        const [a, b, c] = parts;
        return a === 0
            || a === 10
            || a === 127
            || a >= 224
            || (a === 100 && b >= 64 && b <= 127)
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || (a === 192 && b === 0 && c === 0)
            || (a === 192 && b === 0 && c === 2)
            || (a === 192 && b === 88 && c === 99)
            || (a === 198 && (b === 18 || b === 19))
            || (a === 198 && b === 51 && c === 100)
            || (a === 203 && b === 0 && c === 113);
    }

    function isUnsafeIpv6(address) {
        const segments = expandIpv6Address(address);
        if (!segments) return true;
        const allZero = segments.every((part) => part === 0);
        const loopback = segments.slice(0, 7).every((part) => part === 0) && segments[7] === 1;
        if (allZero || loopback) return true;

        if (segments.slice(0, 5).every((part) => part === 0)
            && (segments[5] === 0 || segments[5] === 0xffff)) {
            const mapped = [
                (segments[6] >> 8) & 255,
                segments[6] & 255,
                (segments[7] >> 8) & 255,
                segments[7] & 255,
            ].join('.');
            return isUnsafeIpv4(mapped);
        }

        const first = segments[0];
        return (first & 0xfe00) === 0xfc00
            || (first & 0xffc0) === 0xfe80
            || (first & 0xff00) === 0xff00
            || (first === 0x2001 && segments[1] === 0x0db8);
    }

    function expandIpv6Address(address) {
        let value = normalizeHostname(address).split('%')[0];
        const dotted = value.match(/(^|:)(\d{1,3}(?:\.\d{1,3}){3})$/u);
        if (dotted) {
            const ipv4 = dotted[2].split('.').map((part) => Number(part));
            if (ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
            const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
            const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
            value = value.slice(0, value.length - dotted[2].length) + high + ':' + low;
        }

        const doubleColonMatches = value.match(/::/gu);
        if (doubleColonMatches && doubleColonMatches.length > 1) return null;
        const sides = value.split('::');
        const left = sides[0] ? sides[0].split(':') : [];
        const right = sides.length > 1 && sides[1] ? sides[1].split(':') : [];
        const fill = sides.length > 1 ? 8 - left.length - right.length : 0;
        if (fill < 0) return null;
        const parts = left.concat(Array(fill).fill('0'), right);
        if (parts.length !== 8) return null;
        const segments = parts.map((part) => {
            if (!/^[0-9a-f]{1,4}$/iu.test(part)) return NaN;
            return parseInt(part, 16);
        });
        return segments.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
            ? segments
            : null;
    }

    function getTextByteLength(value) {
        const text = String(value || '');
        if (typeof Buffer !== 'undefined' && Buffer && typeof Buffer.byteLength === 'function') {
            return Buffer.byteLength(text, 'utf8');
        }
        return text.length;
    }

    function refreshConfigSummary() {
        state.provider = '-';
        state.cacheEntries = '-';

        if (!fs || !path || !state.supportPath) return;

        const translatorConfig = path.join(state.supportPath, 'translator.json');
        if (isFile(translatorConfig)) {
            try {
                const cfg = readJsonFile(translatorConfig);
                state.provider = cfg && typeof cfg.provider === 'string' && cfg.provider.trim()
                    ? cfg.provider.trim()
                    : 'unknown';
            } catch (err) {
                state.provider = 'config error';
                addLog('warn', `translator.json read failed: ${formatError(err)}`);
            }
        }

        const diskCache = state.translationCacheFile || path.join(state.supportPath || state.gameRoot || '', 'translation-cache.log');
        if (isFile(diskCache)) {
            try {
                const text = fs.readFileSync(diskCache, 'utf8');
                const lines = text.split(/\r?\n/u).filter((line) => line.trim());
                state.cacheEntries = formatNumber(lines.length);
            } catch (_) {
                state.cacheEntries = 'error';
            }
        }
    }

    function refreshRuntimeContext() {
        state.supportPath = getQueryValue('supportPath');
        state.gameRoot = getQueryValue('gameRoot') || state.gameRoot;
        state.translationCacheFile = getQueryValue('translationCacheFile')
            || (path && state.supportPath ? path.join(state.supportPath, 'translation-cache.log') : '');

        const gameRootReady = Boolean(state.gameRoot && isDirectory(state.gameRoot));
        const supportPathReady = Boolean(state.supportPath && isDirectory(state.supportPath));
        const closeWithGame = getQueryValue('closeWithGame') === '1';
        const runtimeReady = gameRootReady && supportPathReady && closeWithGame;

        setText('game-root', state.gameRoot || '-');
        setStatus('game-root-status', gameRootReady ? 'ok' : 'warn', gameRootReady ? 'ready' : 'unknown');

        setText('support-path', state.supportPath || '-');
        setStatus('support-path-status', supportPathReady ? 'ok' : 'bad', supportPathReady ? 'ready' : 'missing');

        setStatus('main-window-link', closeWithGame ? 'ok' : 'warn', closeWithGame ? 'linked' : 'unlinked');
        setSummaryStatus('runtime-context-summary', runtimeReady ? 'ok' : 'warn', runtimeReady ? 'ready' : 'needs attention');
        setPanelAutoCollapsed('runtime-context-panel', 'runtimeContext', runtimeReady);
    }

    function getGameWindow() {
        try {
            if (window.opener && window.opener !== window && window.opener.closed !== true) {
                return window.opener;
            }
        } catch (_) {}
        return null;
    }

    function notifyTrackerGuiState(open) {
        const gameWindow = getGameWindow();
        if (!gameWindow) return;
        try {
            const state = gameWindow.LiveTranslatorGuiState && typeof gameWindow.LiveTranslatorGuiState === 'object'
                ? gameWindow.LiveTranslatorGuiState
                : {};
            state.translatorOpen = open === true;
            state.updatedAt = Date.now();
            gameWindow.LiveTranslatorGuiState = state;
            const tracker = gameWindow.LiveTranslatorTextTracker;
            if (tracker && typeof tracker.setGuiActive === 'function') {
                tracker.setGuiActive(open === true);
            }
        } catch (_) {}
    }

    function summarizeHookResults(results) {
        const summary = {
            installed: 0,
            skipped: 0,
            failed: 0,
            total: Array.isArray(results) ? results.length : 0,
        };
        for (const result of results || []) {
            if (!result || typeof result.status !== 'string') continue;
            if (Object.prototype.hasOwnProperty.call(summary, result.status)) {
                summary[result.status] += 1;
            }
        }
        return summary;
    }

    function normalizeHookFeedResult(result) {
        const source = result && typeof result === 'object' ? result : {};
        return {
            name: source.name ? String(source.name) : '-',
            displayName: source.displayName ? String(source.displayName) : (source.name ? String(source.name) : '-'),
            category: source.category ? String(source.category) : '',
            module: source.module ? String(source.module) : '',
            status: source.status ? String(source.status) : 'unknown',
            reason: source.reason ? String(source.reason) : '',
            timestamp: source.timestamp || null,
        };
    }

    function normalizeActiveTextRecord(record) {
        const source = record && typeof record === 'object' ? record : {};
        return {
            id: source.id ? String(source.id) : '',
            hook: source.hookLabel ? String(source.hookLabel) : (source.hook ? String(source.hook) : '-'),
            hookKey: source.hook ? String(source.hook) : '',
            surfaceType: source.surfaceType ? String(source.surfaceType) : '',
            original: source.original ? String(source.original) : (source.visibleText ? String(source.visibleText) : ''),
            rawText: source.rawText ? String(source.rawText) : '',
            convertedText: source.convertedText ? String(source.convertedText) : '',
            visibleText: source.visibleText ? String(source.visibleText) : '',
            translationSource: source.translationSource ? String(source.translationSource) : '',
            normalizedSource: source.normalizedSource ? String(source.normalizedSource) : '',
            status: source.status ? String(source.status) : 'detected',
            translation: source.translation ? String(source.translation) : (source.translatedText ? String(source.translatedText) : ''),
            translationReceived: source.translationReceived ? String(source.translationReceived) : '',
            translationDrawn: source.translationDrawn ? String(source.translationDrawn) : '',
            firstSeenAt: source.firstSeenAt || source.seenAt || source.timestamp || null,
            seenAt: source.seenAt || source.timestamp || null,
            updatedAt: source.updatedAt || source.seenAt || source.timestamp || null,
            windowType: source.windowType ? String(source.windowType) : '',
            ownerType: source.ownerType ? String(source.ownerType) : '',
            methodName: source.methodName ? String(source.methodName) : '',
            x: source.x,
            y: source.y,
            bounds: source.bounds && typeof source.bounds === 'object' ? Object.assign({}, source.bounds) : null,
            onScreen: source.onScreen !== undefined ? Boolean(source.onScreen) : true,
            screenState: source.screenState ? String(source.screenState) : '',
            disappearedAt: source.disappearedAt || null,
            deactivatedAt: source.deactivatedAt || source.disappearedAt || null,
            trackerState: source.trackerState ? String(source.trackerState) : '',
            trackable: source.trackable === undefined ? undefined : Boolean(source.trackable),
            metadata: source.metadata && typeof source.metadata === 'object' ? Object.assign({}, source.metadata) : {},
            decisions: Array.isArray(source.decisions) ? source.decisions.map(normalizeDecisionRecord) : [],
        };
    }

    function normalizeDecisionRecord(record) {
        const source = record && typeof record === 'object' ? record : {};
        const nestedRecord = source.record && typeof source.record === 'object' ? source.record : {};
        return {
            at: source.at || source.timestamp || null,
            id: source.id ? String(source.id) : (nestedRecord.id ? String(nestedRecord.id) : ''),
            type: source.type ? String(source.type) : 'event',
            status: source.status ? String(source.status) : (nestedRecord.status ? String(nestedRecord.status) : ''),
            message: source.message ? String(source.message) : '',
            details: source.details && typeof source.details === 'object' ? Object.assign({}, source.details) : {},
            record: nestedRecord && nestedRecord.id ? normalizeActiveTextRecord(nestedRecord) : null,
        };
    }

    function refreshRuntimeFeed() {
        const gameWindow = getGameWindow();
        if (!gameWindow) {
            state.hookResults = [];
            state.hookSummary = null;
            state.textSummary = null;
            state.activeTexts = [];
            state.formerlyActiveTexts = [];
            state.untrackableTexts = [];
            return false;
        }

        try {
            const snapshot = gameWindow.LiveTranslatorHookInstallSnapshot;
            const results = snapshot && Array.isArray(snapshot.results)
                ? snapshot.results
                : (Array.isArray(gameWindow.LiveTranslatorHookInstallResults)
                    ? gameWindow.LiveTranslatorHookInstallResults
                    : []);
            state.hookResults = results.map(normalizeHookFeedResult);
            const textSnapshot = gameWindow.LiveTranslatorTextSnapshot;
            const hasTextFeed = Boolean(textSnapshot);
            const activeTextRecords = textSnapshot && Array.isArray(textSnapshot.active)
                ? textSnapshot.active
                : [];
            const formerTextRecords = textSnapshot && Array.isArray(textSnapshot.former)
                ? textSnapshot.former
                : [];
            const untrackableTextRecords = textSnapshot && Array.isArray(textSnapshot.untrackable)
                ? textSnapshot.untrackable
                : [];
            state.activeTexts = activeTextRecords.map(normalizeActiveTextRecord).map((record) => withDisplayLifecycle(record, 'active'));
            state.formerlyActiveTexts = formerTextRecords.map(normalizeActiveTextRecord).map((record) => withDisplayLifecycle(record, 'former'));
            state.untrackableTexts = untrackableTextRecords.map(normalizeActiveTextRecord).map((record) => withDisplayLifecycle(record, 'untrackable'));
            state.textSummary = textSnapshot && textSnapshot.summary
                ? Object.assign({}, textSnapshot.summary)
                : null;
            state.hookSummary = snapshot && snapshot.summary
                ? Object.assign({}, snapshot.summary)
                : (gameWindow.LiveTranslatorHookInstallSummary
                    ? Object.assign({}, gameWindow.LiveTranslatorHookInstallSummary)
                    : summarizeHookResults(state.hookResults));
            return state.hookResults.length > 0 || hasTextFeed;
        } catch (err) {
            state.hookResults = [];
            state.hookSummary = null;
            state.textSummary = null;
            state.activeTexts = [];
            state.formerlyActiveTexts = [];
            state.untrackableTexts = [];
            addLog('warn', `Runtime feed read failed: ${formatError(err)}`);
            return false;
        }
    }

    function renderStatus() {
        const summary = state.hookSummary;
        if (summary && summary.total > 0) {
            const tone = summary.failed > 0 ? 'bad' : (summary.skipped > 0 ? 'warn' : 'ok');
            setSummaryStatus('runtime-feed', tone, `${formatNumber(summary.installed)} installed / ${formatNumber(summary.total)} hooks`);
        } else {
            setSummaryStatus('runtime-feed', 'warn', 'Not wired');
        }
        setText('provider', state.provider || '-');
        setText('active-count', formatNumber(state.activeTexts.length));
        setText('pending-count', formatNumber(getSummaryCount('pending') + getSummaryCount('translating')));
        setText('completed-count', formatNumber((state.textSummary && state.textSummary.completed) || 0));
        setText('failed-count', formatNumber((state.textSummary && state.textSummary.failed) || 0));
        setText('cache-count', state.cacheEntries || '-');
    }

    function getSummaryCount(key) {
        return Number((state.textSummary && state.textSummary[key]) || 0) || 0;
    }

    function toneForHookStatus(status) {
        if (status === 'installed') return 'ok';
        if (status === 'skipped') return 'warn';
        if (status === 'failed') return 'bad';
        return 'neutral';
    }

    function renderHookResults() {
        const body = refs['hook-results'];
        if (!body) return;

        const summary = state.hookSummary || summarizeHookResults(state.hookResults);
        const tone = summary.failed > 0 ? 'bad' : (summary.skipped > 0 ? 'warn' : 'ok');
        const hooksReady = summary.total > 0
            && summary.failed === 0
            && summary.skipped === 0
            && summary.installed === summary.total;
        setPanelAutoCollapsed('hook-installation-panel', 'hookInstallation', hooksReady);
        setSummaryStatus(
            'hook-summary',
            summary.total > 0 ? tone : 'neutral',
            summary.total > 0
                ? `${formatNumber(summary.installed)} installed, ${formatNumber(summary.skipped)} skipped, ${formatNumber(summary.failed)} failed`
                : '0 hooks'
        );

        if (!state.hookResults.length) {
            body.innerHTML = '<tr><td colspan="3" class="empty">No hook installation records.</td></tr>';
            return;
        }

        body.innerHTML = '';
        for (const item of state.hookResults) {
            const row = document.createElement('tr');
            row.appendChild(createCell(item.displayName || item.name || '-'));
            row.appendChild(createStatusCell(item.status || '-'));
            row.appendChild(createCell(item.reason || '-'));
            body.appendChild(row);
        }
    }

    function renderTextRecordSections() {
        pruneActiveTextRecordDetail();
        state.renderedTextRecordDetailKey = '';
        renderActiveTexts();
        renderFormerlyActiveTexts();
        renderUntrackableTexts();
    }

    function renderActiveTexts() {
        renderTextRecordList({
            bodyId: 'active-texts',
            summaryId: 'active-text-summary',
            records: state.activeTexts,
            emptyText: 'No trackable active text records.',
        });
    }

    function renderFormerlyActiveTexts() {
        renderTextRecordList({
            bodyId: 'formerly-active-texts',
            summaryId: 'formerly-active-summary',
            records: state.formerlyActiveTexts,
            emptyText: 'No formerly active text records.',
            limit: PAST_TEXT_DISPLAY_LIMIT,
            itemOptions: { past: true },
        });
    }

    function renderUntrackableTexts() {
        renderTextRecordList({
            bodyId: 'untrackable-texts',
            summaryId: 'untrackable-summary',
            records: state.untrackableTexts,
            emptyText: 'No untrackable text records.',
            limit: UNTRACKABLE_TEXT_DISPLAY_LIMIT,
            itemOptions: (item) => ({
                untrackable: true,
                past: item && item.displayLifecycle === 'former',
            }),
        });
    }

    function renderTextRecordList(options) {
        const body = refs[options.bodyId];
        if (!body) return;

        const records = Array.isArray(options.records) ? options.records : [];
        setSummaryStatus(options.summaryId, 'neutral', `${formatNumber(records.length)} entries`);

        if (!records.length) {
            body.innerHTML = '';
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = options.emptyText || 'No text records.';
            body.appendChild(empty);
            return;
        }

        const rows = createTextRecordRows(getPrioritizedTextRecords(records, options.limit), options);
        const activeIndex = findActiveTextRecordIndex(rows);
        const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;
        const detailInsertIndex = activeIndex >= 0
            ? getTextRecordDetailInsertIndex(body, activeIndex, rows.length)
            : -1;

        body.innerHTML = '';
        rows.forEach((row, index) => {
            const active = index === activeIndex;
            body.appendChild(createTextRecordItem(row.item, Object.assign({
                active,
                detailKey: row.detailKey,
                recordKey: row.recordKey,
            }, row.itemOptions)));
            if (index === detailInsertIndex) {
                body.appendChild(createTextRecordDetail(activeRow.item, activeRow.itemOptions));
                state.renderedTextRecordDetailKey = activeRow.detailKey;
            }
        });
    }

    function createTextRecordRows(records, options = {}) {
        const duplicateCounts = new Map();
        return (records || []).map((item) => {
            const recordKey = getTextRecordKey(item);
            const duplicateIndex = duplicateCounts.get(recordKey) || 0;
            duplicateCounts.set(recordKey, duplicateIndex + 1);
            return {
                item,
                itemOptions: getTextRecordOptions(item, options),
                recordKey,
                detailKey: getTextRecordDetailKey(options.bodyId, recordKey, duplicateIndex),
            };
        });
    }

    function getPrioritizedTextRecords(records, limit) {
        const sorted = (Array.isArray(records) ? records : [])
            .map((item, index) => ({ item, index }))
            .sort(compareTextRecordDisplayPriority)
            .map((entry) => entry.item);
        const displayLimit = Number(limit);
        return Number.isFinite(displayLimit) && displayLimit > 0
            ? sorted.slice(0, displayLimit)
            : sorted;
    }

    function compareTextRecordDisplayPriority(a, b) {
        const skippedDiff = getSkippedPriority(a.item) - getSkippedPriority(b.item);
        if (skippedDiff) return skippedDiff;

        const messageDiff = getGameMessagePriority(a.item) - getGameMessagePriority(b.item);
        if (messageDiff) return messageDiff;

        return a.index - b.index;
    }

    function getSkippedPriority(item) {
        return normalizeStatusClass(item && item.status) === 'skipped' ? 1 : 0;
    }

    function getGameMessagePriority(item) {
        return isGameMessageRecord(item) ? 0 : 1;
    }

    function isGameMessageRecord(item) {
        if (!item) return false;
        return normalizeHookClass(item.hookKey || item.hook || item.methodName) === 'message';
    }

    function findActiveTextRecordIndex(rows) {
        return (rows || []).findIndex((row) => shouldRenderActiveTextRecordDetail(row.detailKey));
    }

    function getTextRecordDetailInsertIndex(container, activeIndex, recordCount) {
        const flexRowEndIndex = getTextRecordFlexRowEndIndex(container, activeIndex);
        if (flexRowEndIndex >= activeIndex) return Math.min(recordCount - 1, flexRowEndIndex);
        const columns = getTextRecordGridColumnCount(container);
        const rowEndIndex = activeIndex + (columns - ((activeIndex % columns) + 1));
        return Math.min(recordCount - 1, rowEndIndex);
    }

    function getTextRecordFlexRowEndIndex(container, activeIndex) {
        if (!container || activeIndex < 0) return -1;
        const records = Array.from(container.children || [])
            .filter((child) => child && child.classList && child.classList.contains('text-record'));
        const activeRecord = records[activeIndex];
        if (!activeRecord) return -1;
        const rowTop = activeRecord.offsetTop;
        let rowEndIndex = activeIndex;
        for (let index = activeIndex + 1; index < records.length; index += 1) {
            if (Math.abs(records[index].offsetTop - rowTop) > 1) break;
            rowEndIndex = index;
        }
        return rowEndIndex;
    }

    function getTextRecordGridColumnCount(container) {
        try {
            const style = window.getComputedStyle(container);
            const columns = style && String(style.gridTemplateColumns || '').trim();
            if (!columns || columns === 'none') return 1;
            return Math.max(1, columns.split(/\s+/u).filter(Boolean).length);
        } catch (_) {
            return 1;
        }
    }

    function getTextRecordOptions(item, listOptions = {}) {
        return typeof listOptions.itemOptions === 'function'
            ? listOptions.itemOptions(item)
            : (listOptions.itemOptions || {});
    }

    function withDisplayLifecycle(record, lifecycle) {
        return Object.assign({}, record, { displayLifecycle: lifecycle });
    }

    function createTextRecordItem(item, options = {}) {
        const recordKey = options.recordKey || getTextRecordKey(item);
        const detailKey = options.detailKey || recordKey;
        const record = document.createElement('article');
        record.className = `text-record text-status-${normalizeStatusClass(item.status)} text-hook-${normalizeHookClass(item.hookKey || item.hook)}`;
        if (options.past) record.className += ' text-record-past';
        if (options.active) record.className += ' text-record-active';
        if (recordKey) record.dataset.recordKey = recordKey;
        if (detailKey) record.dataset.detailKey = detailKey;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-bubble';
        button.setAttribute('aria-expanded', options.active ? 'true' : 'false');
        button.title = options.active ? 'Hide text record details' : 'Show text record details';
        button.addEventListener('click', () => toggleTextRecordDetail(detailKey));

        const content = document.createElement('span');
        content.className = 'text-bubble-content';
        content.appendChild(createLine(item.rawText || item.original || item.visibleText || '', 'source'));
        content.appendChild(createLine(item.translation || '', 'translation'));
        button.appendChild(content);
        record.appendChild(button);
        return record;
    }

    function createTextRecordDetail(item, options = {}) {
        const recordKey = getTextRecordKey(item);
        const expanded = document.createElement('div');
        expanded.className = `text-expanded text-detail-row text-status-${normalizeStatusClass(item.status)} text-hook-${normalizeHookClass(item.hookKey || item.hook)}`;
        if (options.past) expanded.className += ' text-record-past';
        if (recordKey) expanded.dataset.recordKey = recordKey;
        expanded.appendChild(createExpandedRecordHeader(item, options));
        expanded.appendChild(createTextMetaGrid(item));
        expanded.appendChild(createDecisionList(item));
        return expanded;
    }

    function toggleTextRecordDetail(recordKey) {
        if (!recordKey) return;
        state.activeTextRecordDetailKey = state.activeTextRecordDetailKey === recordKey
            ? ''
            : recordKey;
        renderTextRecordSections();
    }

    function shouldRenderActiveTextRecordDetail(recordKey) {
        return Boolean(recordKey
            && state.activeTextRecordDetailKey === recordKey
            && state.renderedTextRecordDetailKey !== recordKey);
    }

    function createExpandedRecordHeader(item, options = {}) {
        const header = document.createElement('div');
        header.className = 'text-expanded-header';
        const meta = document.createElement('span');
        meta.className = 'text-expanded-meta';
        const labels = [];
        if (options.untrackable) labels.push('untrackable');
        if (options.past) labels.push('former');
        meta.textContent = `${item.hook || '-'} | ${item.status || 'detected'}${labels.length ? ` | ${labels.join(' | ')}` : ''}`;
        header.appendChild(meta);
        header.appendChild(createTextRecordCopyButton(item));
        return header;
    }

    function pruneActiveTextRecordDetail() {
        if (!state.activeTextRecordDetailKey) return;
        const activeKeys = getVisibleTextRecordDetailKeys();
        if (!activeKeys.includes(state.activeTextRecordDetailKey)) state.activeTextRecordDetailKey = '';
    }

    function getVisibleTextRecordDetailKeys() {
        return []
            .concat(createTextRecordRows(getPrioritizedTextRecords(state.activeTexts || []), { bodyId: 'active-texts' }))
            .concat(createTextRecordRows(getPrioritizedTextRecords(state.formerlyActiveTexts || [], PAST_TEXT_DISPLAY_LIMIT), {
                bodyId: 'formerly-active-texts',
            }))
            .concat(createTextRecordRows(getPrioritizedTextRecords(state.untrackableTexts || [], UNTRACKABLE_TEXT_DISPLAY_LIMIT), {
                bodyId: 'untrackable-texts',
            }))
            .map((row) => row.detailKey)
            .filter(Boolean);
    }

    function getTextRecordKey(item) {
        if (!item) return '';
        if (item.id) return item.id;
        return [item.hookKey || item.hook || '', item.original || '', item.translationSource || item.normalizedSource || ''].join('|');
    }

    function getTextRecordDetailKey(sectionId, recordKey, duplicateIndex) {
        return [sectionId || 'text-records', recordKey || '', String(duplicateIndex || 0)].join('|');
    }

    function createTextRecordCopyButton(item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-record-button';
        button.textContent = 'Copy';
        button.title = 'Copy full text record';
        button.setAttribute('aria-label', 'Copy full text record');
        button.addEventListener('click', () => copyTextRecord(item, button));
        return button;
    }

    function copyTextRecord(item, button) {
        const payload = buildTextRecordCopyText(item);
        writeClipboardText(payload)
            .then(() => flashCopyButton(button, 'Copied'))
            .catch((err) => {
                flashCopyButton(button, 'Failed');
                addLog('warn', `Text record copy failed: ${formatError(err)}`);
            });
    }

    function writeClipboardText(text) {
        if (typeof navigator !== 'undefined'
            && navigator.clipboard
            && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text).catch(() => writeClipboardTextFallback(text));
        }
        return writeClipboardTextFallback(text);
    }

    function writeClipboardTextFallback(text) {
        return new Promise((resolve, reject) => {
            const input = document.createElement('textarea');
            input.value = text;
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            input.style.top = '0';
            document.body.appendChild(input);
            input.focus();
            input.select();
            try {
                if (!document.execCommand('copy')) {
                    throw new Error('copy command returned false');
                }
                resolve();
            } catch (err) {
                reject(err);
            } finally {
                document.body.removeChild(input);
            }
        });
    }

    function flashCopyButton(button, label) {
        if (!button) return;
        const original = button.dataset.originalLabel || button.textContent || 'Copy';
        button.dataset.originalLabel = original;
        button.textContent = label;
        button.disabled = true;
        setTimeout(() => {
            if (!button.isConnected) return;
            button.textContent = button.dataset.originalLabel || 'Copy';
            button.disabled = false;
        }, 900);
    }

    function buildTextRecordCopyText(item) {
        const history = getMergedDecisions(item).map((entry) => ({
            at: copyTimestamp(entry.at),
            id: entry.id || '',
            type: entry.type || 'event',
            status: entry.status || '',
            message: entry.message || '',
            details: entry.details || {},
        }));
        const payload = {
            copiedAt: copyTimestamp(Date.now()),
            id: item.id || '',
            hook: {
                key: item.hookKey || '',
                label: item.hook || '',
                type: normalizeHookClass(item.hookKey || item.hook),
            },
            status: item.status || 'detected',
            trackerState: item.trackerState || item.displayLifecycle || '',
            trackable: item.trackable,
            text: {
                original: item.original || '',
                translation: item.translation || '',
                raw: item.rawText || '',
                converted: item.convertedText || '',
                visible: item.visibleText || '',
                translationSource: item.translationSource || '',
                normalizedSource: item.normalizedSource || '',
                translationReceived: item.translationReceived || '',
                translationDrawn: item.translationDrawn || '',
            },
            surface: {
                surfaceType: item.surfaceType || '',
                windowType: item.windowType || '',
                ownerType: item.ownerType || '',
                methodName: item.methodName || '',
                onScreen: item.onScreen !== false,
                screenState: item.screenState || '',
                x: Number.isFinite(Number(item.x)) ? Number(item.x) : null,
                y: Number.isFinite(Number(item.y)) ? Number(item.y) : null,
                bounds: item.bounds || null,
            },
            timestamps: {
                firstSeenAt: copyTimestamp(item.firstSeenAt),
                seenAt: copyTimestamp(item.seenAt),
                updatedAt: copyTimestamp(item.updatedAt),
                disappearedAt: copyTimestamp(item.disappearedAt),
                deactivatedAt: copyTimestamp(item.deactivatedAt),
            },
            metadata: item.metadata || {},
            history,
        };
        return JSON.stringify(payload, null, 2);
    }

    function copyTimestamp(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return {
            epochMs: date.getTime(),
            local: date.toLocaleString(),
        };
    }

    function setPanelAutoCollapsed(panelId, stateKey, healthy) {
        const panel = refs[panelId];
        if (!panel) return;
        const nextHealth = Boolean(healthy);
        if (state.panelHealth[stateKey] === nextHealth) return;
        state.panelHealth[stateKey] = nextHealth;
        panel.open = !nextHealth;
    }

    function createLine(value, kind) {
        const line = document.createElement('span');
        line.className = `text-line ${kind}`;
        line.textContent = String(value || '-');
        return line;
    }

    function createTextMetaGrid(item) {
        const grid = document.createElement('div');
        grid.className = 'text-meta-grid';
        appendMeta(grid, 'First seen', item.firstSeenAt ? formatTime(item.firstSeenAt) : '-');
        appendMeta(grid, 'Seen', item.seenAt ? formatTime(item.seenAt) : '-');
        appendMeta(grid, 'Updated', item.updatedAt ? formatTime(item.updatedAt) : '-');
        appendMeta(grid, 'Screen', item.screenState || (item.onScreen === false ? 'offscreen' : 'visible'));
        if (item.disappearedAt) appendMeta(grid, 'Disappeared', formatTime(item.disappearedAt));
        if (item.deactivatedAt) appendMeta(grid, 'Deactivated', formatTime(item.deactivatedAt));
        appendMeta(grid, 'Tracker', item.trackerState || item.displayLifecycle || '-');
        appendMeta(grid, 'Hook', item.hookKey || item.hook || '-');
        appendMeta(grid, 'Surface', item.surfaceType || item.windowType || item.ownerType || '-');
        appendMeta(grid, 'Method', item.methodName || '-');
        if (item.rawText && item.rawText !== item.original) appendMeta(grid, 'RawDetected', item.rawText);
        if (item.convertedText && item.convertedText !== item.original) appendMeta(grid, 'RenderResolved', item.convertedText);
        appendMeta(grid, 'TranslationSource', item.translationSource || item.normalizedSource || '-');
        appendMeta(grid, 'TranslationReceived', item.translationReceived || '-');
        appendMeta(grid, 'TranslationDrawn', item.translationDrawn || '-');
        if (Number.isFinite(Number(item.x)) || Number.isFinite(Number(item.y))) {
            appendMeta(grid, 'Position', `${formatCoordinate(item.x)}, ${formatCoordinate(item.y)}`);
        }
        if (item.bounds) {
            appendMeta(grid, 'Bounds', formatBounds(item.bounds));
        }
        Object.keys(item.metadata || {}).forEach((key) => {
            appendMeta(grid, key, item.metadata[key]);
        });
        return grid;
    }

    function appendMeta(container, label, value) {
        const item = document.createElement('div');
        item.className = 'text-meta-item';
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        const valueEl = document.createElement('strong');
        valueEl.textContent = String(value === undefined || value === null || value === '' ? '-' : value);
        item.appendChild(labelEl);
        item.appendChild(valueEl);
        container.appendChild(item);
    }

    function createDecisionList(item) {
        const wrap = document.createElement('div');
        wrap.className = 'decision-list';
        const title = document.createElement('div');
        title.className = 'decision-title';
        title.textContent = 'History';
        wrap.appendChild(title);

        const decisions = getMergedDecisions(item);
        if (!decisions.length) {
            const empty = document.createElement('div');
            empty.className = 'decision-empty';
            empty.textContent = 'No decision history recorded.';
            wrap.appendChild(empty);
            return wrap;
        }

        decisions.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'decision-row';

            const time = document.createElement('span');
            time.className = 'decision-time';
            time.textContent = entry.at ? formatTime(entry.at) : '-';
            row.appendChild(time);

            const body = document.createElement('div');
            body.className = 'decision-body';
            const label = document.createElement('strong');
            label.textContent = entry.type || 'event';
            body.appendChild(label);
            if (entry.message) {
                const message = document.createElement('span');
                message.textContent = entry.message;
                body.appendChild(message);
            }
            const detailsText = formatDetails(entry.details);
            if (detailsText) {
                const detailsEl = document.createElement('code');
                detailsEl.textContent = detailsText;
                body.appendChild(detailsEl);
            }
            row.appendChild(body);
            wrap.appendChild(row);
        });
        return wrap;
    }

    function getMergedDecisions(item) {
        const local = Array.isArray(item.decisions) ? item.decisions : [];
        const seen = new Set();
        return local
            .filter((entry) => {
                if (!entry) return false;
                const key = `${entry.at || ''}|${entry.type || ''}|${entry.message || ''}|${formatDetails(entry.details)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
    }

    function formatDetails(details) {
        if (!details || typeof details !== 'object') return '';
        return Object.keys(details)
            .filter((key) => details[key] !== undefined && details[key] !== null && details[key] !== '')
            .map((key) => `${key}=${formatDetailValue(details[key])}`)
            .join(', ');
    }

    function formatDetailValue(value) {
        if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return String(value);
        try {
            return JSON.stringify(value);
        } catch (_) {
            return String(value);
        }
    }

    function formatBounds(bounds) {
        if (!bounds || typeof bounds !== 'object') return '-';
        const x1 = formatCoordinate(bounds.x1);
        const y1 = formatCoordinate(bounds.y1);
        const x2 = formatCoordinate(bounds.x2);
        const y2 = formatCoordinate(bounds.y2);
        if ([x1, y1, x2, y2].some((value) => value === '-')) return '-';
        return `${x1}, ${y1} - ${x2}, ${y2}`;
    }

    function normalizeStatusClass(status) {
        const value = String(status || 'detected').toLowerCase();
        if (value === 'completed') return 'completed';
        if (value === 'translating' || value === 'pending' || value === 'detected') return value;
        if (value === 'failed' || value === 'error') return 'failed';
        if (value === 'skipped' || value === 'stale' || value === 'removed' || value === 'disappeared') return value;
        return 'detected';
    }

    function normalizeHookClass(hook) {
        const value = String(hook || '').toLowerCase();
        if (value.includes('bitmap')) return 'bitmap';
        if (value.includes('sprite')) return 'sprite';
        if (value.includes('choice')) return 'choice';
        if (value.includes('help')) return 'help';
        if (value.includes('message')) return 'message';
        if (value.includes('pixi')) return 'pixi';
        if (value.includes('draw') || value.includes('window')) return 'window';
        return 'unknown';
    }

    function formatCoordinate(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? String(Math.round(numeric)) : '-';
    }

    function createCell(value) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        return cell;
    }

    function createStatusCell(value) {
        const cell = document.createElement('td');
        const pill = document.createElement('span');
        pill.className = `status ${toneForHookStatus(value)}`;
        pill.textContent = String(value);
        cell.appendChild(pill);
        return cell;
    }

    function addLog(level, message) {
        const stamp = new Date().toLocaleTimeString();
        const normalized = String(message || '').replace(/\s+$/u, '');
        if (!normalized) return;
        state.logLines.push(`[${stamp}] ${String(level || 'info').toUpperCase()} ${normalized}`);
        state.logLines = state.logLines.slice(-80);
        renderLogs();
    }

    function renderLogs() {
        if (!refs.logs) return;
        const lines = state.logLines.slice(-80);
        refs.logs.textContent = lines.length ? lines.join('\n') : 'No log entries.';
        refs.logs.scrollTop = refs.logs.scrollHeight;
    }

    function clearLog() {
        state.logLines = [];
        renderLogs();
    }

    function updateHeartbeat() {
        setText('heartbeat', `open ${formatDuration(Date.now() - state.startedAt)} - ${formatTime(new Date())}`);
    }

    function installGameCloseWatcher() {
        if (getQueryValue('closeWithGame') !== '1') return;
        state.heartbeatTimer = setInterval(() => {
            updateHeartbeat();
            if (refreshRuntimeFeed()) {
                renderStatus();
                renderHookResults();
                renderTextRecordSections();
                renderLogs();
            }
            try {
                if (window.opener && window.opener.closed === true) {
                    closeSelf();
                }
            } catch (_) {
                closeSelf();
            }
        }, 1000);

        window.addEventListener('beforeunload', () => {
            notifyTrackerGuiState(false);
            if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = null;
        });
    }

    function closeSelf() {
        try {
            if (globalThis.nw && nw.Window && typeof nw.Window.get === 'function') {
                nw.Window.get().close(true);
                return;
            }
        } catch (_) {}
        try { window.close(); } catch (_) {}
    }

    function formatError(err) {
        if (!err) return 'unknown error';
        return err.message ? err.message : String(err);
    }

    function bindEvents() {
        if (refs['clear-log']) refs['clear-log'].addEventListener('click', clearLog);
    }

    function boot() {
        initRefs();
        bindEvents();
        notifyTrackerGuiState(true);
        window.addEventListener('beforeunload', () => {
            notifyTrackerGuiState(false);
            stopUpdateChecker();
        });
        const nodeReady = initNode();
        refreshRuntimeContext();
        refreshConfigSummary();
        startUpdateChecker();
        refreshRuntimeFeed();
        renderStatus();
        renderHookResults();
        renderTextRecordSections();
        updateHeartbeat();
        installGameCloseWatcher();
        addLog('info', nodeReady ? 'GUI monitor loaded.' : 'GUI monitor loaded without Node APIs.');
        if (!state.hookResults.length) addLog('info', 'Runtime feed is not connected.');
    }

    if (globalThis.__LiveTranslatorGuiExposeTestApi === true) {
        globalThis.LiveTranslatorGuiTestApi = {
            normalizeVersionString,
            parseVersionPayload,
            validateVersionCheckUrl,
            isUnsafeIpAddress,
        };
    }

    boot();
})();
