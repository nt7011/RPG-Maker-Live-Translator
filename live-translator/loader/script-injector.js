// Script injection helper for loader phases.
// It appends classic script tags in sequence so RPG Maker/NW.js globals are initialized in order.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineLoaderModule = globalScope.LiveTranslatorLoaderDefine;
    if (typeof defineLoaderModule !== 'function') {
        throw new Error('[LiveTranslatorLoader] Loader module registry is unavailable.');
    }

    function injectScript(url, documentRef) {
        return new Promise((resolve, reject) => {
            const doc = documentRef || (typeof document !== 'undefined' ? document : null);
            if (!doc) {
                reject(new Error('[LiveTranslatorLoader] No document context available for script injection.'));
                return;
            }
            const parent = doc.head || doc.documentElement;
            if (!parent || typeof parent.appendChild !== 'function') {
                reject(new Error('[LiveTranslatorLoader] Document has no script insertion point.'));
                return;
            }

            const tag = doc.createElement('script');
            tag.src = url;
            tag.async = false;
            tag.onload = resolve;
            tag.onerror = () => reject(new Error(`Failed to load ${url}`));
            parent.appendChild(tag);
        });
    }

    function createScriptInjector(options = {}) {
        const supportDir = options.supportDir || '';
        const documentRef = options.document || (typeof document !== 'undefined' ? document : null);
        let logger = options.logger || null;

        function logLoaded(script) {
            if (logger && typeof logger.debug === 'function') {
                logger.debug(`[LiveTranslatorLoader] Loaded script ${script}`);
            }
        }

        async function injectSupportScript(script) {
            const url = new URL(script, supportDir).href;
            await injectScript(url, documentRef);
            logLoaded(script);
        }

        async function injectSupportScripts(scripts) {
            for (const script of scripts || []) {
                await injectSupportScript(script);
            }
        }

        return {
            injectScript: (url) => injectScript(url, documentRef),
            injectSupportScript,
            injectSupportScripts,
            setLogger(nextLogger) {
                logger = nextLogger || logger;
            },
        };
    }

    defineLoaderModule('scriptInjector', {
        createScriptInjector,
        injectScript,
    });
})();
