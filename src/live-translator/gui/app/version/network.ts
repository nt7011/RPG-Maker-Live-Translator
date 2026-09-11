import { getGuiConfiguredPolicy } from '../policy.js';
import { callNodeMethod, getUtf8ByteLength, hasHttpsModule, onNodeEvent, readNodeHeader, readNodeStatusCode, requestHttps, } from '../node-bridge.js';
import type { UnknownRecord } from '../types.js';
import { falsyFallback, stringValue } from '../types.js';
export function fetchRemoteText(url: string): Promise<string> {
    if (hasHttpsModule())
        return fetchRemoteTextWithNode(url, 0);
    return fetchRemoteTextWithBrowser(url);
}
export function fetchRemoteTextWithNode(rawUrl: string | URL, redirectCount: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const updatePolicy = getGuiConfiguredPolicy().updates;
        let url: URL;
        try {
            url = new URL(rawUrl);
            validateVersionCheckUrl(url);
        }
        catch (error: unknown) {
            reject(error instanceof Error ? error : new Error(stringValue(error)));
            return;
        }
        let finished = false;
        function finish(error: unknown, value?: string): void {
            if (finished)
                return;
            finished = true;
            if (error)
                reject(error instanceof Error ? error : new Error(stringValue(error)));
            else
                resolve(value ?? '');
        }
        const requestOptions: UnknownRecord = {
            method: 'GET',
            timeout: updatePolicy.timeoutMs,
            headers: {
                Accept: 'application/json, text/plain;q=0.8, */*;q=0.1',
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
            },
        };
        const request = requestHttps(url, requestOptions, (response) => {
            const status = readNodeStatusCode(response);
            const redirectLocation = readNodeHeader(response, 'location');
            if (isRedirectStatus(status) && redirectLocation) {
                callNodeMethod(response, 'resume');
                if (redirectCount >= updatePolicy.maxRedirects) {
                    finish(new Error('too many update check redirects'));
                    return;
                }
                let nextUrl;
                try {
                    nextUrl = new URL(stringValue(redirectLocation), url.href);
                    validateVersionCheckUrl(nextUrl);
                }
                catch (error: unknown) {
                    finish(error);
                    return;
                }
                fetchRemoteTextWithNode(nextUrl.href, redirectCount + 1).then((value) => {
                    finish(null, value);
                }, (error: unknown) => {
                    finish(error);
                });
                return;
            }
            if (status < 200 || status >= 300) {
                callNodeMethod(response, 'resume');
                finish(new Error(`HTTP ${String(status)}`));
                return;
            }
            const chunks: string[] = [];
            let total = 0;
            callNodeMethod(response, 'setEncoding', 'utf8');
            onNodeEvent(response, 'data', (chunk: unknown) => {
                total += getTextByteLength(chunk);
                if (total > updatePolicy.maxBytes) {
                    callNodeMethod(response, 'destroy');
                    finish(new Error('version response too large'));
                    return;
                }
                chunks.push(stringValue(chunk));
            });
            onNodeEvent(response, 'end', () => {
                finish(null, chunks.join(''));
            });
            onNodeEvent(response, 'error', (error: unknown) => {
                finish(error);
            });
        });
        onNodeEvent(request, 'timeout', () => {
            callNodeMethod(request, 'destroy', new Error('update check timed out'));
        });
        onNodeEvent(request, 'error', (error: unknown) => {
            finish(error);
        });
        callNodeMethod(request, 'end');
    });
}
export async function fetchRemoteTextWithBrowser(rawUrl: string | URL): Promise<string> {
    if (typeof fetch !== 'function') {
        throw new Error('no network API available');
    }
    const url = new URL(rawUrl);
    validateVersionCheckUrl(url);
    const updatePolicy = getGuiConfiguredPolicy().updates;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
        ? setTimeout(() => {
            controller.abort();
        }, updatePolicy.timeoutMs)
        : null;
    try {
        const requestOptions: RequestInit = {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
        };
        if (controller)
            requestOptions.signal = controller.signal;
        const response = await fetch(url.href, requestOptions);
        if (!response.ok) {
            throw new Error(`HTTP ${String(response.status)}`);
        }
        if (response.url)
            validateVersionCheckUrl(new URL(response.url));
        return await readLimitedResponseText(response);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
export async function readLimitedResponseText(response: Response): Promise<string> {
    const maxBytes = getGuiConfiguredPolicy().updates.maxBytes;
    if (response.body && typeof response.body.getReader === 'function' && typeof TextDecoder === 'function') {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        const chunks: string[] = [];
        let total = 0;
        try {
            for (;;) {
                const result = await reader.read();
                if (result.done)
                    break;
                const value = result.value;
                total += falsyFallback(value.byteLength, falsyFallback(value.length, 0));
                if (total > maxBytes) {
                    void reader.cancel();
                    throw new Error('version response too large');
                }
                chunks.push(decoder.decode(value, { stream: true }));
            }
            chunks.push(decoder.decode());
            return chunks.join('');
        }
        finally {
            reader.releaseLock();
        }
    }
    const text = await response.text();
    if (getTextByteLength(text) > maxBytes) {
        throw new Error('version response too large');
    }
    return text;
}
export function isRedirectStatus(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
export function validateVersionCheckUrl(url: URL): void {
    if (url.protocol !== 'https:') {
        throw new Error('update checks require HTTPS');
    }
    if (url.username || url.password) {
        throw new Error('update check URL credentials are not allowed');
    }
    if (isBlockedVersionCheckHost(url.hostname)) {
        throw new Error('update check URL local hosts are not allowed');
    }
}
export function getTextByteLength(value: unknown): number {
    return getUtf8ByteLength(stringValue(falsyFallback(value, '')));
}
export function isBlockedVersionCheckHost(rawHostname: unknown): boolean {
    const hostname = normalizeVersionCheckHostname(rawHostname);
    if (!hostname)
        return true;
    if (hostname === 'localhost' || hostname.endsWith('.localhost'))
        return true;
    if (isBlockedVersionCheckIpv4(hostname))
        return true;
    if (isBlockedVersionCheckIpv6(hostname))
        return true;
    return false;
}
export function normalizeVersionCheckHostname(rawHostname: unknown): string {
    const hostname = stringValue(falsyFallback(rawHostname, '')).trim().toLowerCase().replace(/\.$/u, '');
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.slice(1, -1);
    }
    return hostname;
}
export function isBlockedVersionCheckIpv4(hostname: string): boolean {
    const match = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/u.exec(hostname);
    if (!match)
        return false;
    const octets = match.slice(1).map((value) => Number(value));
    if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255))
        return true;
    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    return (first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 198 && (second === 18 || second === 19)) ||
        first >= 224);
}
export function isBlockedVersionCheckIpv6(hostname: string): boolean {
    if (!hostname.includes(':'))
        return false;
    if (hostname === '::' || hostname === '::1')
        return true;
    if (hostname.startsWith('fc') || hostname.startsWith('fd'))
        return true;
    if (/^fe[89ab][0-9a-f]*:/u.test(hostname))
        return true;
    if (hostname.startsWith('::ffff:'))
        return true;
    return false;
}
