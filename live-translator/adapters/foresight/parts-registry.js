// Internal composition store for Foresight scanner support parts.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before Foresight parts.');
    }

    const parts = Object.create(null);

    defineRuntimeModule('adapters.foresight.partsRegistry', Object.freeze({
        getParts() {
            return parts;
        },
    }));
})();
