// Bounded draw-capture diagnostics for text that never becomes an orchestrator item.
// Adapters record their native draw decisions here so missed text can be traced
// through window, bitmap, sprite, message, and policy bypasses.
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
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/draw-capture-trace.js.');
    }

    const DEFAULT_EVENT_LIMIT = 320;
    const MAX_EVENT_LIMIT = 2000;
    const DEFAULT_TEXT_LIMIT = 160;
    const MAX_SUMMARY_KEYS = 40;
    const CJK_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/u;

    function createDrawCaptureTrace(options = {}) {
        const settings = readTraceSettings(options.settings || {});
        const runtimeSettings = options.settings && typeof options.settings === 'object'
            ? options.settings
            : {};
        const events = [];
        let sequence = 0;
        let publishQueued = false;
        let enabled = settings.enabled;

        function record(stage, details = {}) {
            if (!isEnabled()) return null;
            const source = details && typeof details === 'object' ? details : {};
            const rawText = firstString(source.rawText, source.text, source.visibleText, source.normalizedText);
            const visibleText = firstString(source.visibleText, source.normalizedText, rawText);
            if (!shouldRecord(rawText, visibleText, source)) return null;

            const event = sanitize(Object.assign({}, source, {
                seq: ++sequence,
                at: Date.now(),
                stage: String(stage || source.stage || 'draw'),
                adapter: firstString(source.adapter, source.sourceAdapter, ''),
                methodName: firstString(source.methodName, source.method, ''),
                rawText: limitText(rawText),
                visibleText: limitText(visibleText),
                normalizedText: limitText(firstString(source.normalizedText, visibleText, rawText)),
            }), 3);
            events.push(event);
            while (events.length > settings.limit) events.shift();
            schedulePublish();
            return event;
        }

        function shouldRecord(rawText, visibleText, source) {
            if (source && source.force === true) return true;
            if (settings.recordAll) return true;
            const texts = [rawText, visibleText, firstString(source && source.normalizedText, '')]
                .map((value) => String(value || ''))
                .filter(Boolean);
            if (!texts.length) return false;
            if (matchesTargetText(texts)) return true;
            return settings.recordCjk && texts.some((value) => CJK_TEXT_PATTERN.test(value));
        }

        function matchesTargetText(texts) {
            if (!settings.targetTexts.length) return false;
            return settings.targetTexts.some((target) => {
                return texts.some((value) => value.indexOf(target) >= 0);
            });
        }

        function clear() {
            events.length = 0;
            schedulePublish();
        }

        function setEnabled(value) {
            enabled = value !== false;
            schedulePublish();
            return enabled;
        }

        function isEnabled() {
            return enabled && isTraceDiagnosticsEnabled();
        }

        function schedulePublish() {
            if (publishQueued) return;
            publishQueued = true;
            Promise.resolve().then(() => {
                publishQueued = false;
                publish();
            }).catch(() => {});
        }

        function publish() {
            if (!isTraceDiagnosticsEnabled()) {
                events.length = 0;
                sequence = 0;
                try { delete globalScope.LiveTranslatorDrawCaptureTraceSnapshot; } catch (_) {
                    try { globalScope.LiveTranslatorDrawCaptureTraceSnapshot = null; } catch (__) {}
                }
                return null;
            }
            try {
                globalScope.LiveTranslatorDrawCaptureTraceSnapshot = getSnapshot();
            } catch (_) {}
            return globalScope.LiveTranslatorDrawCaptureTraceSnapshot || null;
        }

        function getSnapshot(optionsArg = {}) {
            if (!isTraceDiagnosticsEnabled(optionsArg)) return null;
            const optionsObject = optionsArg && typeof optionsArg === 'object' ? optionsArg : {};
            const limit = positiveInteger(optionsObject.limit, settings.limit, 1, settings.limit);
            const list = events.slice(-limit).map((event) => sanitize(event, 3));
            return {
                updatedAt: Date.now(),
                enabled: isEnabled(),
                limit: settings.limit,
                size: events.length,
                sequence,
                filters: {
                    recordCjk: settings.recordCjk,
                    recordAll: settings.recordAll,
                    targetTexts: settings.targetTexts.slice(),
                },
                summary: summarizeEvents(list),
                events: list,
            };
        }

        function getDiagnosticsPolicy(optionsArg = {}) {
            const policy = globalScope.LiveTranslatorDiagnosticsPolicy;
            if (policy && typeof policy.getSnapshotPolicy === 'function') {
                return policy.getSnapshotPolicy(Object.assign({
                    globalScope,
                    settings: runtimeSettings,
                }, optionsArg || {}));
            }
            return createFallbackDiagnosticsPolicy(optionsArg);
        }

        function createFallbackDiagnosticsPolicy(optionsArg = {}) {
            const guiState = globalScope.LiveTranslatorGuiState;
            const guiActive = !guiState || typeof guiState !== 'object'
                ? true
                : guiState.translatorOpen === true;
            const diagnostics = runtimeSettings.diagnostics && typeof runtimeSettings.diagnostics === 'object'
                ? runtimeSettings.diagnostics
                : null;
            const level = resolveFallbackLevel(diagnostics, optionsArg, guiActive);
            const surface = guiActive && level !== 'none';
            const detailView = surface && level === 'full';
            return {
                mode: surface ? level : 'none',
                surface,
                detailView,
                full: detailView,
                performanceMode: surface && level === 'performance',
                none: !surface,
            };
        }

        function resolveFallbackLevel(diagnostics, optionsArg = {}, guiActive = true) {
            if (!guiActive || optionsArg.surface === false || optionsArg.enabled === false) return 'none';
            const requested = normalizeFallbackLevel(optionsArg.mode || optionsArg.level || optionsArg.diagnosticsMode)
                || normalizeFallbackLevel(diagnostics && (diagnostics.mode || diagnostics.level));
            let level = requested
                || (diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'performanceMode')
                    ? (diagnostics.performanceMode === true ? 'performance' : 'full')
                    : '')
                || (diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'detailView')
                    ? (diagnostics.detailView === true ? 'full' : 'performance')
                    : (runtimeSettings.performanceMode === true ? 'performance' : 'full'));
            if ((optionsArg.detailView === false || optionsArg.includeDetails === false) && level !== 'none') {
                level = 'performance';
            }
            return level;
        }

        function normalizeFallbackLevel(value) {
            const text = String(value || '').trim().toLowerCase();
            if (!text) return '';
            if (text === 'none' || text === 'off' || text === 'disabled' || text === 'closed') return 'none';
            if (text === 'full' || text === 'detail' || text === 'details' || text === 'debug') return 'full';
            if (text === 'performance'
                || text === 'performancemode'
                || text === 'performance-mode'
                || text === 'surface'
                || text === 'minimal'
                || text === 'minimum') return 'performance';
            return '';
        }

        function isTraceDiagnosticsEnabled(optionsArg = {}) {
            const policy = getDiagnosticsPolicy(optionsArg);
            return policy && policy.detailView === true;
        }

        const api = {
            record,
            clear,
            clearDiagnostics: clear,
            setEnabled,
            getSnapshot,
            snapshot: getSnapshot,
            publish,
            isEnabled,
        };

        try { globalScope.LiveTranslatorDrawCaptureTrace = api; } catch (_) {}
        publish();
        return api;
    }

    function readTraceSettings(settings) {
        const source = settings && settings.drawCaptureTrace && typeof settings.drawCaptureTrace === 'object'
            ? settings.drawCaptureTrace
            : {};
        return {
            enabled: source.enabled !== false,
            recordCjk: source.recordCjk !== false,
            recordAll: source.recordAll === true,
            limit: positiveInteger(source.limit, DEFAULT_EVENT_LIMIT, 1, MAX_EVENT_LIMIT),
            targetTexts: normalizeTargetTexts(source.targetTexts),
        };
    }

    function normalizeTargetTexts(value) {
        if (!Array.isArray(value)) return [];
        const seen = new Set();
        const list = [];
        value.forEach((entry) => {
            const text = String(entry || '').trim();
            if (!text || seen.has(text)) return;
            seen.add(text);
            list.push(text);
        });
        return list.slice(0, 32);
    }

    function summarizeEvents(events) {
        const summary = {
            total: events.length,
            byStage: {},
            byAdapter: {},
            byMethod: {},
            byReason: {},
            byWindowType: {},
            byOwnerType: {},
            byText: {},
        };
        events.forEach((event) => {
            count(summary.byStage, event.stage);
            count(summary.byAdapter, event.adapter);
            count(summary.byMethod, event.methodName || event.method);
            count(summary.byReason, event.reason);
            count(summary.byWindowType, event.windowType);
            count(summary.byOwnerType, event.ownerType);
            count(summary.byText, event.normalizedText || event.visibleText || event.rawText);
        });
        Object.keys(summary).forEach((key) => {
            if (key !== 'total') summary[key] = topCounts(summary[key]);
        });
        return summary;
    }

    function count(bucket, key) {
        const label = String(key || '').trim();
        if (!label) return;
        bucket[label] = (bucket[label] || 0) + 1;
    }

    function topCounts(bucket) {
        return Object.entries(bucket || {})
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, MAX_SUMMARY_KEYS)
            .reduce((output, entry) => {
                output[entry[0]] = entry[1];
                return output;
            }, {});
    }

    function firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value) return value;
            if (value !== undefined && value !== null && typeof value !== 'object') {
                const text = String(value);
                if (text) return text;
            }
        }
        return '';
    }

    function limitText(value) {
        const text = String(value || '');
        return text.length <= DEFAULT_TEXT_LIMIT
            ? text
            : `${text.slice(0, Math.max(0, DEFAULT_TEXT_LIMIT - 3))}...`;
    }

    function positiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
        const numeric = Number(value);
        if (!Number.isInteger(numeric)) return fallback;
        return Math.max(min, Math.min(max, numeric));
    }

    function sanitize(value, depth = 2) {
        if (value === undefined) return undefined;
        if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
        if (depth <= 0) return String(value);
        if (Array.isArray(value)) {
            return value.slice(0, 24).map((item) => sanitize(item, depth - 1));
        }
        if (typeof value === 'object') {
            const output = {};
            Object.keys(value).slice(0, 40).forEach((key) => {
                const sanitized = sanitize(value[key], depth - 1);
                if (sanitized !== undefined) output[key] = sanitized;
            });
            return output;
        }
        return String(value);
    }

    defineRuntimeModule('runtime.drawCaptureTrace', {
        createDrawCaptureTrace,
    });
})();
