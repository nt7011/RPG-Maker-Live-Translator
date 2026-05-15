// Translation manager support: common.
// Owns logging, priorities, settings, and provider adapters; translation-manager.js composes it into the public runtime module.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/common.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before translation-manager/common.js.');
    }

    const constants = requireRuntimeModule('runtime.translationManagerConstants');
    const { DEFAULT_PRIORITY, DEFAULT_RESERVED_PRIORITY_LANES, HOOK_PRIORITIES, MAX_PRIORITY, MIN_PRIORITY } = constants;

    function noop() {}

    function defaultPreview(text, max = 48) {
        const value = String(text ?? '').replace(/\s+/g, ' ').trim();
        return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`;
    }

    function bindLogger(logger = {}) {
        return {
            debug: typeof logger.debug === 'function' ? logger.debug.bind(logger) : noop,
            info: typeof logger.info === 'function' ? logger.info.bind(logger) : noop,
            warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : noop,
            error: typeof logger.error === 'function' ? logger.error.bind(logger) : noop,
        };
    }

    function resolveTranslationDiagnosticsFactory() {
        if (typeof requireRuntimeModule !== 'function') {
            throw new Error('[LiveTranslator] runtime.translationDiagnostics is unavailable before translation-manager.js.');
        }
        const module = requireRuntimeModule('runtime.translationDiagnostics');
        if (module && typeof module.createTranslationDiagnostics === 'function') {
            return module.createTranslationDiagnostics;
        }
        throw new Error('[LiveTranslator] runtime.translationDiagnostics did not export createTranslationDiagnostics.');
    }

    function ensureTelemetry(telemetry) {
        return telemetry && typeof telemetry.logTranslation === 'function'
            ? telemetry
            : { logTranslation: noop };
    }

    function clampPriority(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return DEFAULT_PRIORITY;
        return Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.round(numeric)));
    }

    function defaultPriorityForHook(hook) {
        const key = String(hook || '').trim();
        if (Object.prototype.hasOwnProperty.call(HOOK_PRIORITIES, key)) return HOOK_PRIORITIES[key];
        return DEFAULT_PRIORITY;
    }

    function getPositiveSetting(settings, names, fallback) {
        const translation = settings && settings.translation && typeof settings.translation === 'object'
            ? settings.translation
            : {};
        for (const name of names) {
            if (Object.prototype.hasOwnProperty.call(translation, name)) {
                const numeric = Number(translation[name]);
                if (Number.isFinite(numeric) && numeric > 0) return numeric;
            }
        }
        return fallback;
    }

    function createReservedPriorityLanePolicies(_settings = {}) {
        // v1 intentionally ships with a single hardcoded lane. It is still shaped
        // as policy data so a later settings file can tune lane count, thresholds,
        // matching rules, or blocking behavior without rewriting the scheduler.
        // TODO(priority-lanes): read these policies from settings.translation once
        // the UX and diagnostics for user-configured lanes are settled.
        return DEFAULT_RESERVED_PRIORITY_LANES.map((lane) => ({
            name: String(lane.name || 'reserved'),
            enabledAtCapacity: Math.max(1, Math.floor(Number(lane.enabledAtCapacity) || 1)),
            reservedSlots: Math.max(0, Math.floor(Number(lane.reservedSlots) || 0)),
            priority: clampPriority(lane.priority),
            // Empty hooks means adapter-agnostic. v1 reserves for any priority
            // 1000 subscriber, regardless of which adapter produced it.
            hooks: Array.isArray(lane.hooks) ? lane.hooks.map((hook) => String(hook || '')).filter(Boolean) : [],
            blocksNormalDispatch: lane.blocksNormalDispatch === true,
        })).filter((lane) => lane.reservedSlots > 0);
    }

    function createTextProcessorProvider(textProcessor, isLocalProvider) {
        return {
            kind: isLocalProvider ? 'local' : 'legacy',
            async getCapacity() {
                return 1;
            },
            async translate(request = {}) {
                const text = String(request.text ?? '');
                if (request.stream && textProcessor && typeof textProcessor.translateTextStream === 'function') {
                    return textProcessor.translateTextStream(text, request);
                }
                if (textProcessor && typeof textProcessor.translateText === 'function') {
                    return textProcessor.translateText(text);
                }
                if (textProcessor && typeof textProcessor.translateMany === 'function') {
                    const output = await textProcessor.translateMany([text]);
                    return output && typeof output[0] === 'string' ? output[0] : '';
                }
                throw new Error('Translator provider unavailable.');
            },
        };
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

    defineRuntimeModule('runtime.translationManagerCommon', {
        noop,
        defaultPreview,
        bindLogger,
        resolveTranslationDiagnosticsFactory,
        ensureTelemetry,
        clampPriority,
        defaultPriorityForHook,
        getPositiveSetting,
        createReservedPriorityLanePolicies,
        createTextProcessorProvider,
        createNoneProvider,
    });
})();
