'use strict';

// Abort helpers normalize cancellation between fetch, timers, and the CLI worker loop.

function createAbortError() {
    const err = new Error('Translation stopped.');
    err.name = 'AbortError';
    err.code = 'ABORT_ERR';
    return err;
}

function createAbortController() {
    return typeof AbortController === 'function' ? new AbortController() : null;
}

function isAbortError(err) {
    return !!(err && (err.name === 'AbortError' || err.code === 'ABORT_ERR'));
}

function assertNotAborted(signal) {
    if (signal && signal.aborted) throw createAbortError();
}

function sleep(ms, signal) {
    assertNotAborted(signal);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        if (!signal || typeof signal.addEventListener !== 'function') return;
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(createAbortError());
        }, { once: true });
    });
}

module.exports = {
    assertNotAborted,
    createAbortController,
    createAbortError,
    isAbortError,
    sleep,
};
