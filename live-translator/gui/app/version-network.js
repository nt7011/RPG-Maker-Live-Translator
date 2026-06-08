// Translator monitor version network helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function fetchRemoteText(url) {
    if (https) return fetchRemoteTextWithNode(url, 0);
    return fetchRemoteTextWithBrowser(url);
}

function fetchRemoteTextWithNode(rawUrl, redirectCount) {
    return new Promise((resolve, reject) => {
        const updatePolicy = getGuiConfiguredPolicy().updates;
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
            timeout: updatePolicy.timeoutMs,
            headers: {
                Accept: 'application/json, text/plain;q=0.8, */*;q=0.1',
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
            },
        }, (response) => {
            const status = Number(response.statusCode) || 0;
            if (isRedirectStatus(status) && response.headers && response.headers.location) {
                response.resume();
                if (redirectCount >= updatePolicy.maxRedirects) {
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
                if (total > updatePolicy.maxBytes) {
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
    const updatePolicy = getGuiConfiguredPolicy().updates;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
        ? setTimeout(() => controller.abort(), updatePolicy.timeoutMs)
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
    const maxBytes = getGuiConfiguredPolicy().updates.maxBytes;
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
                if (total > maxBytes) {
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
    if (getTextByteLength(text) > maxBytes) {
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
    if (isBlockedVersionCheckHost(url.hostname)) {
        throw new Error('update check URL local hosts are not allowed');
    }
}

function getTextByteLength(value) {
    const text = String(value || '');
    if (typeof Buffer !== 'undefined' && Buffer && typeof Buffer.byteLength === 'function') {
        return Buffer.byteLength(text, 'utf8');
    }
    return text.length;
}

function isBlockedVersionCheckHost(rawHostname) {
    const hostname = normalizeVersionCheckHostname(rawHostname);
    if (!hostname) return true;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
    if (isBlockedVersionCheckIpv4(hostname)) return true;
    if (isBlockedVersionCheckIpv6(hostname)) return true;
    return false;
}

function normalizeVersionCheckHostname(rawHostname) {
    const hostname = String(rawHostname || '').trim().toLowerCase();
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.slice(1, -1);
    }
    return hostname;
}

function isBlockedVersionCheckIpv4(hostname) {
    const match = hostname.match(/^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/u);
    if (!match) return false;
    const octets = match.slice(1).map((value) => Number(value));
    if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;

    const first = octets[0];
    const second = octets[1];
    return first === 0
        || first === 10
        || first === 127
        || (first === 100 && second >= 64 && second <= 127)
        || (first === 169 && second === 254)
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168)
        || (first === 198 && (second === 18 || second === 19))
        || first >= 224;
}

function isBlockedVersionCheckIpv6(hostname) {
    if (!hostname.includes(':')) return false;
    if (hostname === '::' || hostname === '::1') return true;
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true;
    if (/^fe[89ab][0-9a-f]*:/u.test(hostname)) return true;
    if (hostname.startsWith('::ffff:')) return true;
    return false;
}
