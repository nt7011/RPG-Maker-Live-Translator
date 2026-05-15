// Translator monitor version network helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function fetchRemoteText(url) {
    if (https) return fetchRemoteTextWithNode(url, 0);
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
}

function getTextByteLength(value) {
    const text = String(value || '');
    if (typeof Buffer !== 'undefined' && Buffer && typeof Buffer.byteLength === 'function') {
        return Buffer.byteLength(text, 'utf8');
    }
    return text.length;
}
