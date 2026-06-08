// In-process provider for snapshot and local smoke runs.
// By default it replaces source letters with stable marker alphabets; when
// configured for randomized strings it keeps the same layout-preserving rules
// but emits fresh Korean/English marker text for every provider request.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translator/providers/mock-translator-provider.js.');
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
        createAbortError,
        getGlobalTranslatorConfig,
        positiveInteger,
    } = utils;

    const DEFAULT_MOCK_CAPACITY = 32;
    const DEFAULT_MOCK_DELAY_MS = 100;
    const DEFAULT_RANDOMIZED_STRINGS = false;
    const CJK_MARKERS = '가나다라마바사아';
    const LATIN_MARKERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const LATIN_RANDOM_MARKERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const HANGUL_SYLLABLE_START = 0xAC00;
    const HANGUL_SYLLABLE_COUNT = 0xD7A3 - HANGUL_SYLLABLE_START + 1;
    const CJK_LETTER_PATTERN = /[\u1100-\u11FF\u3040-\u30FF\u31F0-\u31FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF\uF900-\uFAFF\uFF66-\uFF9F]/u;
    const LATIN_LETTER_PATTERN = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\uFF21-\uFF3A\uFF41-\uFF5A]/u;

    function normalizeMockTranslatorConfig(rootConfig = {}) {
        const root = rootConfig && typeof rootConfig === 'object' ? rootConfig : {};
        const source = root.settings && root.settings.mockTranslator && typeof root.settings.mockTranslator === 'object'
            ? root.settings.mockTranslator
            : {};
        return {
            capacity: positiveInteger(source.capacity, DEFAULT_MOCK_CAPACITY),
            delayMs: nonNegativeInteger(source.delayMs, DEFAULT_MOCK_DELAY_MS),
            useRandomizedStrings: booleanSetting(source.useRandomizedStrings, DEFAULT_RANDOMIZED_STRINGS),
        };
    }

    function createMockTranslatorProvider(options = {}) {
        const cfg = normalizeMockTranslatorConfig(options.translatorConfig || getGlobalTranslatorConfig());

        return {
            kind: 'mockTranslator',
            config: cfg,
            async getCapacity() {
                return cfg.capacity;
            },
            async translate(request = {}) {
                await waitForMockDelay(cfg.delayMs, request.signal);
                return mockTranslateText(String(request.text ?? ''), cfg);
            },
        };
    }

    function booleanSetting(value, fallback) {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true') return true;
            if (normalized === 'false') return false;
        }
        return fallback;
    }

    function nonNegativeInteger(value, fallback) {
        if (value === undefined || value === null || value === '') return fallback;
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
    }

    function waitForMockDelay(delayMs, signal) {
        const waitMs = nonNegativeInteger(delayMs, DEFAULT_MOCK_DELAY_MS);
        if (signal && signal.aborted) return Promise.reject(signal.reason || createAbortError());
        if (waitMs <= 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
            let timeoutId = null;
            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = null;
                if (signal && typeof signal.removeEventListener === 'function') {
                    try { signal.removeEventListener('abort', onAbort); } catch (_) {}
                }
            };
            const onAbort = () => {
                cleanup();
                reject(signal.reason || createAbortError());
            };
            timeoutId = setTimeout(() => {
                cleanup();
                resolve();
            }, waitMs);
            if (signal && typeof signal.addEventListener === 'function') {
                signal.addEventListener('abort', onAbort, { once: true });
            }
        });
    }

    function mockTranslateText(text, options = {}) {
        const cfg = options && typeof options === 'object' ? options : {};
        if (cfg.useRandomizedStrings === true) {
            return mockTranslateTextRandomized(text, cfg.random);
        }
        return mockTranslateTextSequential(text);
    }

    function mockTranslateTextSequential(text) {
        let cjkIndex = 0;
        let latinIndex = 0;
        let translated = '';

        for (const char of String(text ?? '')) {
            if (CJK_LETTER_PATTERN.test(char)) {
                translated += CJK_MARKERS[cjkIndex % CJK_MARKERS.length];
                cjkIndex += 1;
            } else if (LATIN_LETTER_PATTERN.test(char)) {
                translated += LATIN_MARKERS[latinIndex % LATIN_MARKERS.length];
                latinIndex += 1;
            } else {
                translated += char;
            }
        }

        return translated;
    }

    function mockTranslateTextRandomized(text, random) {
        let translated = '';

        for (const char of String(text ?? '')) {
            if (CJK_LETTER_PATTERN.test(char)) {
                translated += randomHangulSyllable(random);
            } else if (LATIN_LETTER_PATTERN.test(char)) {
                translated += LATIN_RANDOM_MARKERS[randomIndex(random, LATIN_RANDOM_MARKERS.length)];
            } else {
                translated += char;
            }
        }

        return translated;
    }

    function randomHangulSyllable(random) {
        // U+AC00..U+D7A3 is the modern precomposed Hangul syllable block, so
        // every selected codepoint is a valid Korean display character.
        return String.fromCharCode(HANGUL_SYLLABLE_START + randomIndex(random, HANGUL_SYLLABLE_COUNT));
    }

    function randomIndex(random, maxExclusive) {
        const source = typeof random === 'function' ? random : Math.random;
        const raw = Number(source());
        const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(raw, 0.999999999999)) : 0;
        return Math.floor(normalized * maxExclusive);
    }

    defineRuntimeModule('runtime.translationMockTranslatorProvider', {
        createMockTranslatorProvider,
        mockTranslateText,
        normalizeMockTranslatorConfig,
        waitForMockDelay,
    });
})();
