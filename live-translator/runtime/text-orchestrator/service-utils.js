// Text orchestrator support: service-utils.
// Owns translation-service normalization and handle safety; the facade composes these helpers into each orchestrator instance.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/service-utils.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before runtime/text-orchestrator/service-utils.js.');
    }

    const base = requireRuntimeModule('runtime.textOrchestratorBaseUtils');
    const { firstDefined, firstString } = base;

    function createProviderDispatchPolicy(options = {}) {
        const providerContext = options.providerContext && typeof options.providerContext === 'object'
            ? options.providerContext
            : {};
        const explicit = options.isCacheOnlyProvider !== undefined
            || Object.prototype.hasOwnProperty.call(providerContext, 'isCacheOnlyProvider');
        return {
            explicit,
            enabled: !(options.isCacheOnlyProvider === true || providerContext.isCacheOnlyProvider === true),
        };
    }

    function mergeProviderDispatchPolicy(current, service) {
        if (current && current.explicit) return current;
        if (!service || service.isCacheOnlyProvider !== true) return current || { explicit: false, enabled: true };
        return {
            explicit: false,
            enabled: false,
        };
    }

    /**
     * Accept only the request-capable part of the translation service contract.
     */
    function normalizeTranslationService(service) {
        return service && typeof service.request === 'function' ? service : null;
    }

    /**
     * Normalize the result of translationService.request into the handle shape
     * the orchestrator expects.
     *
     * The preferred handle has a promise plus cancel/setPriority/source helpers.
     * Plain promises are accepted for defensive compatibility, but they cannot
     * be canceled or reprioritized.
     */
    function normalizeTranslationHandle(handle, options = {}) {
        if (handle && handle.promise && typeof handle.promise.then === 'function') {
            return decorateTranslationHandle(handle);
        }
        if (handle && typeof handle.then === 'function') {
            return decorateTranslationHandle({
                promise: handle,
                cancel: () => false,
                setPriority: () => false,
                getPriority: () => clampPriority(options.priority),
                getStatus: () => 'unknown',
                getSourceHint: () => firstString(options.sourceHint, 'provider'),
            });
        }
        const error = new Error('Translation request did not return a promise.');
        const promise = Promise.reject(error);
        promise.catch(() => {});
        return decorateTranslationHandle({
            promise,
            cancel: () => false,
            setPriority: () => false,
            getPriority: () => clampPriority(options.priority),
            getStatus: () => 'failed',
            getSourceHint: () => firstString(options.sourceHint, 'provider'),
        });
    }

    /**
     * Add Promise-like convenience methods to a translation handle.
     *
     * Some callers and tests treat handles like promises, so the orchestrator
     * preserves that ergonomic contract even after wrapping plain handles.
     */
    function decorateTranslationHandle(handle) {
        if (!handle || !handle.promise || typeof handle.promise.then !== 'function') return handle;
        if (typeof handle.then !== 'function') {
            handle.then = (...args) => handle.promise.then(...args);
        }
        if (typeof handle.catch !== 'function') {
            handle.catch = (...args) => handle.promise.catch(...args);
        }
        if (typeof handle.finally !== 'function') {
            handle.finally = (...args) => handle.promise.finally(...args);
        }
        return handle;
    }

    /**
     * Read the best available source hint from a completed translation handle.
     */
    function resolveHandleSourceHint(handle, fallback = 'provider') {
        try {
            if (handle && typeof handle.getSourceHint === 'function') {
                return firstString(handle.getSourceHint(), fallback);
            }
        } catch (_) {}
        return firstString(handle && handle.sourceHint, fallback);
    }

    /**
     * Detect cancellation-style errors without depending on one AbortError
     * implementation across browser, NW.js, and tests.
     */
    function isAbortErrorLike(error) {
        if (!error) return false;
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return true;
        const message = typeof error.message === 'string' ? error.message : String(error);
        return /\bAbortError\b/i.test(message) || /\baborted\b/i.test(message) || /\bcanceled\b/i.test(message);
    }

    defineRuntimeModule('runtime.textOrchestratorServiceUtils', {
        createProviderDispatchPolicy,
        mergeProviderDispatchPolicy,
        normalizeTranslationService,
        normalizeTranslationHandle,
        decorateTranslationHandle,
        resolveHandleSourceHint,
        isAbortErrorLike,
    });
})();
