// Pure helper functions for the Precacher UI controller.
// These helpers avoid touching DOM or filesystem state so app.js can focus on workflow orchestration.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    function createEmptyMetrics() {
            return {
                failed: 0,
                activeWorkers: 0,
                completedBatches: 0,
                queueLength: 0,
                successfulTokens: 0,
                totalTokens: 0,
                tokensPerSecond: 0,
                etaSeconds: null,
            };
        }
    
    function createEmptyPrecacheStats() {
            return {
                total: 0,
                translated: 0,
                untranslated: 0,
            };
        }
    
    function getNodeRequire() {
            if (typeof require === 'function') return require;
            if (globalThis.nw && typeof nw.require === 'function') return nw.require;
            return null;
        }
    
    function getQueryValue(name) {
            try {
                return new URL(window.location.href).searchParams.get(name) || '';
            } catch (_) {
                return '';
            }
        }
    
    function trimTrailingSeparator(value) {
            return String(value || '').replace(/[\\/]$/u, '');
        }
    
    function formatNumber(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return '0';
            return Math.round(numeric).toLocaleString('en-US');
        }
    
    function formatTime(date) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
            return date.toLocaleString();
        }
    
    function formatRate(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric < 0) return '0.0';
            return numeric.toFixed(1);
        }
    
    function formatDuration(seconds) {
            const numeric = Number(seconds);
            if (!Number.isFinite(numeric) || numeric < 0) return '-';
            const totalSeconds = Math.ceil(numeric);
            if (totalSeconds < 60) return `${totalSeconds}s`;
            const minutes = Math.floor(totalSeconds / 60);
            const remainderSeconds = totalSeconds % 60;
            if (minutes < 60) return remainderSeconds
                ? `${minutes}m ${remainderSeconds}s`
                : `${minutes}m`;
            const hours = Math.floor(minutes / 60);
            const remainderMinutes = minutes % 60;
            return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
        }
    
    function parseDurationSeconds(value) {
            const text = String(value || '').trim().toLowerCase();
            if (!text || text === '-') return null;
            let total = 0;
            let matched = false;
            text.replace(/(\d+(?:\.\d+)?)\s*([hms])/g, (_, amount, unit) => {
                matched = true;
                const numeric = Number(amount);
                if (unit === 'h') total += numeric * 3600;
                if (unit === 'm') total += numeric * 60;
                if (unit === 's') total += numeric;
                return '';
            });
            return matched ? Math.ceil(total) : null;
        }
    
    function parseFormattedInteger(value) {
            const numeric = Number(String(value || '').replace(/,/g, ''));
            return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
        }
    
    function normalizeNullableMetric(value, fallback) {
            if (value === null) return null;
            if (typeof value === 'undefined') return fallback;
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
        }
    
    function normalizeMetric(value, fallback) {
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
        }
    
    function normalizePositiveInteger(value) {
            const numeric = Number(value);
            return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
        }
    
    function firstPositiveInteger(...values) {
            for (const value of values) {
                const numeric = normalizePositiveInteger(value);
                if (numeric !== null) return numeric;
            }
            return null;
        }
    
    function isAbortError(err) {
            return !!(err && (err.name === 'AbortError' || err.code === 'ABORT_ERR'));
        }
    
    function formatError(err) {
            if (!err) return 'unknown error';
            return err.message ? err.message : String(err);
        }
    
    function formatConsoleValue(value) {
            if (value instanceof Error) return value.stack || value.message;
            if (value && typeof value === 'object') {
                try {
                    return JSON.stringify(value);
                } catch (_) {
                    return String(value);
                }
            }
            return String(value);
        }

    globalScope.PrecacheUiSupport = Object.freeze({
        createEmptyMetrics,
        createEmptyPrecacheStats,
        firstPositiveInteger,
        formatConsoleValue,
        formatDuration,
        formatError,
        formatNumber,
        formatRate,
        formatTime,
        getNodeRequire,
        getQueryValue,
        isAbortError,
        normalizeMetric,
        normalizeNullableMetric,
        normalizePositiveInteger,
        parseDurationSeconds,
        parseFormattedInteger,
        trimTrailingSeparator,
    });
})();
