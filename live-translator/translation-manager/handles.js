// Translation manager support: handles.
// Owns subscriber handles and abort/deferred helpers; translation-manager.js composes it into the public runtime module.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/handles.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before translation-manager/handles.js.');
    }

    const common = requireRuntimeModule('runtime.translationManagerCommon');
    const { clampPriority, noop } = common;

    function createAbortError(reason) {
        const message = reason && reason.message ? reason.message : (reason || 'Translation request canceled.');
        const error = new Error(String(message));
        try { error.name = 'AbortError'; } catch (_) {}
        try { error.code = 'ABORT_ERR'; } catch (_) {}
        return error;
    }

    function isAbortErrorLike(error) {
        if (!error) return false;
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return true;
        const message = typeof error.message === 'string' ? error.message : String(error);
        return /\bAbortError\b/i.test(message) || /\baborted\b/i.test(message);
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

    function decorateHandle(handle) {
        handle.then = (...args) => handle.promise.then(...args);
        handle.catch = (...args) => handle.promise.catch(...args);
        handle.finally = (...args) => handle.promise.finally(...args);
        return handle;
    }

    function createImmediateHandle(result, options = {}) {
        const promise = options.error
            ? Promise.reject(options.error)
            : Promise.resolve(result);
        // Avoid an unhandled rejection when callers only inspect status.
        if (options.error) promise.catch(noop);
        const sourceHint = options.sourceHint ? String(options.sourceHint) : '';
        return decorateHandle({
            id: options.id || '',
            key: options.key || '',
            sourceHint,
            promise,
            cancel: () => false,
            setPriority: () => false,
            getPriority: () => clampPriority(options.priority),
            getStatus: () => options.status || (options.error ? 'failed' : 'completed'),
            getSourceHint: () => sourceHint,
        });
    }

    defineRuntimeModule('runtime.translationManagerHandles', {
        createAbortError,
        isAbortErrorLike,
        createDeferred,
        decorateHandle,
        createImmediateHandle,
    });
})();
