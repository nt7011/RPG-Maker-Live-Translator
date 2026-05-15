// DeepL provider and disabled-provider implementations.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translator/providers/deepl-provider.js.');
    }

    function requireModule(moduleName) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(moduleName);
        }
        const modules = globalScope.LiveTranslatorModules || {};
        if (modules[moduleName]) return modules[moduleName];
        return String(moduleName || '').split('.').reduce((current, part) => {
            return current && current[part] ? current[part] : null;
        }, modules);
    }

    const utils = requireModule('runtime.translationProviderUtils');
    const {
        coerceFetchError,
        createLinkedAbort,
        getFetch,
        getGlobalSettings,
        getGlobalTranslatorConfig,
        markHttpError,
        normalizeDeepLConfig,
    } = utils;

    function createDeepLProvider(options = {}) {
        const cfg = normalizeDeepLConfig(options.translatorConfig || getGlobalTranslatorConfig(), options.settings || getGlobalSettings());
        const fetchImpl = getFetch(options);

        return {
            kind: 'deepl',
            config: cfg,
            async getCapacity() {
                return 1;
            },
            async translate(request = {}) {
                const prepared = prepareDeepLText(String(request.text ?? ''));
                const body = new URLSearchParams();
                body.append('text', prepared.text);
                body.append('target_lang', cfg.language);
                if (prepared.newlines.length) {
                    body.append('tag_handling', 'xml');
                    body.append('ignore_tags', 'lt-nl');
                }
                const linked = createLinkedAbort({
                    signal: request.signal,
                    timeoutMs: request.timeoutMs || cfg.timeoutMs,
                });
                try {
                    const response = await fetchImpl('https://api-free.deepl.com/v2/translate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': `DeepL-Auth-Key ${cfg.apiKey}`,
                        },
                        body: body.toString(),
                        signal: linked.signal,
                    });
                    if (!response || !response.ok) {
                        const status = response ? response.status : 0;
                        const statusText = response ? response.statusText : 'no response';
                        const retryAfter = response && response.headers && typeof response.headers.get === 'function'
                            ? response.headers.get('Retry-After')
                            : null;
                        throw markHttpError(new Error(`DeepL API error: ${status} ${statusText}`), status, retryAfter);
                    }
                    const data = await response.json();
                    const first = data && Array.isArray(data.translations) ? data.translations[0] : null;
                    const translated = first && typeof first.text === 'string' ? first.text : '';
                    return restoreDeepLNewlines(translated, prepared);
                } catch (error) {
                    throw coerceFetchError(error, linked, 'DeepL request failed');
                } finally {
                    linked.cleanup();
                }
            },
        };
    }

    function prepareDeepLText(text) {
        const newlines = [];
        const source = String(text ?? '');
        if (!/\r\n|\r|\n/.test(source)) {
            return {
                text: source,
                newlines,
            };
        }

        let lastIndex = 0;
        let encoded = '';
        source.replace(/\r\n|\r|\n/g, (value, offset) => {
            const index = newlines.length;
            newlines.push(value);
            encoded += escapeDeepLXmlText(source.slice(lastIndex, offset));
            encoded += `<lt-nl i="${index}"/>`;
            lastIndex = offset + value.length;
            return value;
        });
        encoded += escapeDeepLXmlText(source.slice(lastIndex));
        return {
            text: encoded,
            newlines,
        };
    }

    function restoreDeepLNewlines(text, prepared) {
        const source = String(text ?? '');
        const newlines = Array.isArray(prepared && prepared.newlines) ? prepared.newlines : [];
        if (!newlines.length) return source;
        const restored = source.replace(/<lt-nl\s+i=["']?(\d+)["']?\s*\/>|<lt-nl\s+i=["']?(\d+)["']?\s*>\s*<\/lt-nl>/gi, (match, selfClosing, paired) => {
            const index = Number(selfClosing !== undefined ? selfClosing : paired);
            return Number.isInteger(index) && index >= 0 && index < newlines.length ? newlines[index] : '';
        });
        return unescapeDeepLXmlText(restored);
    }

    function escapeDeepLXmlText(text) {
        return String(text ?? '').replace(/[&<>"']/g, (value) => {
            switch (value) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&apos;';
            default: return value;
            }
        });
    }

    function unescapeDeepLXmlText(text) {
        return String(text ?? '').replace(/&(?:#(\d+)|#x([0-9a-f]+)|amp|lt|gt|quot|apos);/gi, (entity, decimal, hex) => {
            if (decimal !== undefined) {
                const codePoint = Number(decimal);
                return Number.isInteger(codePoint) ? safeFromCodePoint(codePoint, entity) : entity;
            }
            if (hex !== undefined) {
                const codePoint = Number.parseInt(hex, 16);
                return Number.isInteger(codePoint) ? safeFromCodePoint(codePoint, entity) : entity;
            }
            switch (entity.toLowerCase()) {
            case '&amp;': return '&';
            case '&lt;': return '<';
            case '&gt;': return '>';
            case '&quot;': return '"';
            case '&apos;': return "'";
            default: return entity;
            }
        });
    }

    function safeFromCodePoint(codePoint, fallback) {
        try {
            return String.fromCodePoint(codePoint);
        } catch (_) {
            return fallback;
        }
    }

    function createNoneProvider() {
        return {
            kind: 'none',
            async getCapacity() {
                return Number.MAX_SAFE_INTEGER;
            },
            async translate() {
                const error = new Error('No translation provider is configured.');
                try { error.code = 'PROVIDER_DISABLED'; } catch (_) {}
                try { error.retryable = false; } catch (_) {}
                throw error;
            },
        };
    }

    defineRuntimeModule('runtime.translationDeeplProvider', {
        createDeepLProvider,
        createNoneProvider,
        prepareDeepLText,
        restoreDeepLNewlines,
        escapeDeepLXmlText,
        unescapeDeepLXmlText,
    });
})();
