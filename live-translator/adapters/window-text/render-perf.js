// Window text adapter support: render performance metric helpers.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.renderPerf',
        factory() {

    const WINDOW_TEXT_PERF_DOMAIN = 'translator-render.windowText';

    function createRenderPerfController(context = {}) {
        const perf = context.perf || null;
        const isBitmapSurfaceTextEntry = typeof context.isBitmapSurfaceTextEntry === 'function'
            ? context.isBitmapSurfaceTextEntry
            : () => false;

        function isPerfEnabled() {
            if (!perf) return false;
            if (typeof perf.isEnabled === 'function') {
                try { return perf.isEnabled() === true; } catch (_) { return false; }
            }
            return typeof perf.count === 'function' || typeof perf.time === 'function' || typeof perf.top === 'function';
        }

        function perfNow() {
            try {
                if (perf && typeof perf.now === 'function') return Number(perf.now()) || 0;
            } catch (_) {}
            try {
                if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
                    return performance.now();
                }
            } catch (_) {}
            return Date.now();
        }

        function perfStart() {
            return isPerfEnabled() ? perfNow() : null;
        }

        function perfCount(name, amount = 1, domain = WINDOW_TEXT_PERF_DOMAIN) {
            if (!perf || typeof perf.count !== 'function') return;
            try { perf.count(name, amount, { domain }); } catch (_) {}
        }

        function perfElapsed(name, start, domain = WINDOW_TEXT_PERF_DOMAIN) {
            if (!perf || typeof perf.time !== 'function') return;
            if (start === null || start === undefined) return;
            const value = Number(start);
            if (!Number.isFinite(value)) return;
            const ms = Math.max(0, perfNow() - value);
            try { perf.time(name, ms, { domain }); } catch (_) {}
        }

        function perfTop(group, label, amount = 1, domain = WINDOW_TEXT_PERF_DOMAIN) {
            if (!perf || typeof perf.top !== 'function') return;
            try { perf.top(group, label, amount, { domain }); } catch (_) {}
        }

        function perfLabel(value, fallback = 'unknown') {
            const text = String(value || fallback || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 48);
            return text || fallback || 'unknown';
        }

        function getWindowTextPerfMethod(entry) {
            if (isBitmapSurfaceTextEntry(entry)) return 'bitmapSurface';
            return entry && entry.type === 'drawTextEx' ? 'drawTextEx' : 'drawText';
        }

        function getWindowTextMetricPrefix(entry, route) {
            return `windowText.${getWindowTextPerfMethod(entry)}.${perfLabel(route, 'redraw')}`;
        }

        return {
            isPerfEnabled,
            perfNow,
            perfStart,
            perfCount,
            perfElapsed,
            perfTop,
            perfLabel,
            getWindowTextPerfMethod,
            getWindowTextMetricPrefix,
        };
    }
            return { create: createRenderPerfController };
        },
    });
})();
