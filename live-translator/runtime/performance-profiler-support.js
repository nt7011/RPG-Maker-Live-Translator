// Helper layer for runtime/performance-profiler.js.
//
// The profiler owns live counters and frame lifecycle. This support module
// keeps option normalization, platform APIs, path/file writes, and snapshot
// formatting in reusable helpers that have no profiler state of their own.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/performance-profiler-support.js.');
    }

    const DEFAULT_TARGET_FPS = 40;
    const MAX_TARGET_FPS = 240;
    const DEFAULT_SLOW_FRAME_MS = 1000 / DEFAULT_TARGET_FPS;
    const DEFAULT_ROLLING_FRAMES = 1200;
    const DEFAULT_AUTO_DUMP_INTERVAL_MS = 5000;
    const DEFAULT_TOP_LIMIT = 25;

    function createDefaultProfilerOptions() {
        return {
            enabled: false,
            targetFps: DEFAULT_TARGET_FPS,
            rollingFrames: DEFAULT_ROLLING_FRAMES,
            slowFrameMs: DEFAULT_SLOW_FRAME_MS,
            targetFrameMs: DEFAULT_SLOW_FRAME_MS,
            droppedFrameMultiplier: 2,
            autoDumpSlowFrames: true,
            autoDumpMinFrameMs: 0,
            autoDumpIncludeFrames: true,
            autoDumpToFile: true,
            autoDumpDirectory: '',
            autoDumpIntervalMs: DEFAULT_AUTO_DUMP_INTERVAL_MS,
            topLimit: DEFAULT_TOP_LIMIT,
        };
    }

    function resolveProfilerOptions(raw = {}) {
        const defaultOptions = createDefaultProfilerOptions();
        const src = raw && typeof raw === 'object' ? raw : {};
        const next = Object.assign({}, defaultOptions, src);
        const targetFpsValue = Object.prototype.hasOwnProperty.call(src, 'targetFps')
            ? src.targetFps
            : (Object.prototype.hasOwnProperty.call(src, 'targetFPS') ? src.targetFPS : defaultOptions.targetFps);
        const targetFps = resolveTargetFps(targetFpsValue);
        const targetFrameMs = 1000 / targetFps;
        next.enabled = next.enabled === true;
        next.targetFps = targetFps;
        delete next.targetFPS;
        next.rollingFrames = Math.max(DEFAULT_ROLLING_FRAMES, Math.min(5000, Number(next.rollingFrames) || defaultOptions.rollingFrames));
        next.slowFrameMs = targetFrameMs;
        next.targetFrameMs = targetFrameMs;
        next.droppedFrameMultiplier = Math.max(1.1, Number(next.droppedFrameMultiplier) || defaultOptions.droppedFrameMultiplier);
        next.autoDumpMinFrameMs = resolveAutoDumpMinFrameMs(next.autoDumpMinFrameMs, targetFrameMs, next.droppedFrameMultiplier);
        next.autoDumpSlowFrames = true;
        next.autoDumpIncludeFrames = true;
        next.autoDumpToFile = true;
        next.autoDumpDirectory = typeof next.autoDumpDirectory === 'string' ? next.autoDumpDirectory.trim() : '';
        next.autoDumpIntervalMs = Math.max(250, Number(next.autoDumpIntervalMs) || DEFAULT_AUTO_DUMP_INTERVAL_MS);
        next.topLimit = Math.max(DEFAULT_TOP_LIMIT, Math.min(100, Number(next.topLimit) || defaultOptions.topLimit));
        return next;
    }

    function resolveAutoDumpMinFrameMs(value, targetFrameMs, droppedFrameMultiplier) {
        const explicit = Number(value);
        if (Number.isFinite(explicit) && explicit > 0) return Math.max(Number(targetFrameMs) || 1, explicit);
        const target = Number(targetFrameMs) || DEFAULT_SLOW_FRAME_MS;
        const multiplier = Number(droppedFrameMultiplier) || 2;
        return target * multiplier;
    }

    function resolveTargetFps(value) {
        const fps = Number(value);
        if (!Number.isFinite(fps) || fps <= 0) return DEFAULT_TARGET_FPS;
        return Math.max(1, Math.min(MAX_TARGET_FPS, fps));
    }

    function createProfilerPlatform(options = {}) {
        const scope = options.globalScope || globalScope;
        const getConfig = typeof options.getConfig === 'function' ? options.getConfig : () => ({});

        function now() {
            try {
                if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
                    return performance.now();
                }
            } catch (_) {}
            return Date.now();
        }

        function requestFrame(callback) {
            try {
                const fn = scope && typeof scope.requestAnimationFrame === 'function'
                    ? scope.requestAnimationFrame
                    : (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
                if (fn) return fn.call(scope, callback);
            } catch (_) {}
            return setTimeout(() => callback(now()), 16);
        }

        function cancelFrame(handle) {
            try {
                const fn = scope && typeof scope.cancelAnimationFrame === 'function'
                    ? scope.cancelAnimationFrame
                    : (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
                if (fn) {
                    fn.call(scope, handle);
                    return;
                }
            } catch (_) {}
            try { clearTimeout(handle); } catch (_) {}
        }

        function resolveNodeFileApi() {
            try {
                const req = typeof require === 'function'
                    ? require
                    : (scope && typeof scope.require === 'function' ? scope.require : null);
                if (!req) return null;
                const fs = req('fs');
                const path = req('path');
                return { fs, path };
            } catch (_) {
                return null;
            }
        }

        function resolvePathContext() {
            try {
                return scope.LiveTranslatorPaths && typeof scope.LiveTranslatorPaths === 'object'
                    ? scope.LiveTranslatorPaths
                    : {};
            } catch (_) {
                return {};
            }
        }

        function getProcessCwd() {
            try {
                if (typeof process !== 'undefined' && process && typeof process.cwd === 'function') {
                    const cwd = process.cwd();
                    return typeof cwd === 'string' ? cwd : '';
                }
            } catch (_) {}
            return '';
        }

        function defaultDumpDirectory() {
            const nodeApi = resolveNodeFileApi();
            if (!nodeApi || !nodeApi.path) return '';
            const paths = resolvePathContext();
            const configured = paths && typeof paths.perfDirectory === 'string' ? paths.perfDirectory.trim() : '';
            if (configured) return configured;
            const supportPath = paths && typeof paths.supportPath === 'string' ? paths.supportPath.trim() : '';
            if (supportPath) return nodeApi.path.join(supportPath, 'perf');
            const gameRoot = paths && typeof paths.gameRoot === 'string' ? paths.gameRoot.trim() : '';
            const base = gameRoot || getProcessCwd();
            return base ? nodeApi.path.join(base, 'live-translator', 'perf') : '';
        }

        function defaultDumpPath(prefix = 'live-translator-perf') {
            const nodeApi = resolveNodeFileApi();
            if (!nodeApi || !nodeApi.path) return null;
            const directory = defaultDumpDirectory();
            if (!directory) return null;
            return nodeApi.path.join(directory, `${prefix}-${safeFileTimestamp()}.json`);
        }

        function autoDumpPath() {
            const nodeApi = resolveNodeFileApi();
            if (!nodeApi || !nodeApi.path) return null;
            const config = getConfig() || {};
            const directory = config && config.autoDumpDirectory ? config.autoDumpDirectory : '';
            if (directory) {
                return nodeApi.path.join(directory, `live-translator-perf-auto-${safeFileTimestamp()}.json`);
            }
            return defaultDumpPath('live-translator-perf-auto');
        }

        function writeProfilerSnapshotToFile(snapshot, filePath = null) {
            const nodeApi = resolveNodeFileApi();
            if (!nodeApi || !nodeApi.fs) {
                throw new Error('Node fs API is unavailable in this runtime.');
            }
            const target = filePath || defaultDumpPath();
            if (!target) {
                throw new Error('Unable to resolve a profiler dump path.');
            }
            const payload = JSON.stringify(snapshot, null, 2);
            try {
                if (nodeApi.path && typeof nodeApi.path.dirname === 'function') {
                    const dir = nodeApi.path.dirname(target);
                    if (dir && dir !== '.' && dir !== target && !nodeApi.fs.existsSync(dir)) {
                        nodeApi.fs.mkdirSync(dir, { recursive: true });
                    }
                }
            } catch (_) {}
            nodeApi.fs.writeFileSync(target, payload, 'utf8');
            return target;
        }

        return Object.freeze({
            now,
            requestFrame,
            cancelFrame,
            defaultDumpDirectory,
            defaultDumpPath,
            autoDumpPath,
            writeProfilerSnapshotToFile,
        });
    }

    function toPlainCounterObject(map) {
        const rows = {};
        try {
            Array.from(map.entries())
                .sort((a, b) => b[1] - a[1])
                .forEach(([key, value]) => {
                    rows[key] = value;
                });
        } catch (_) {}
        return rows;
    }

    function timingRows(map) {
        try {
            return Array.from(map.entries())
                .sort((a, b) => b[1].totalMs - a[1].totalMs)
                .map(([name, value]) => ({
                    name,
                    count: value.count || 0,
                    totalMs: Math.round((value.totalMs || 0) * 100) / 100,
                    avgMs: value.count ? Math.round((value.totalMs / value.count) * 1000) / 1000 : 0,
                    maxMs: Math.round((value.maxMs || 0) * 100) / 100,
                }));
        } catch (_) {
            return [];
        }
    }

    function topRows(topGroups, limit = DEFAULT_TOP_LIMIT) {
        const result = {};
        try {
            topGroups.forEach((groupMap, group) => {
                result[group] = Array.from(groupMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, limit)
                    .map(([label, count]) => ({ label, count }));
            });
        } catch (_) {}
        return result;
    }

    function hasFrameData(frame) {
        if (!frame) return false;
        if (frame.slow) return true;
        if (frame.counters && Object.keys(frame.counters).length) return true;
        if (frame.timings && Object.keys(frame.timings).length) return true;
        return false;
    }

    function addTiming(target, name, ms) {
        if (!target || !name || !Number.isFinite(ms) || ms < 0) return;
        const existingValue = target[name] || { count: 0, totalMs: 0, maxMs: 0 };
        existingValue.count += 1;
        existingValue.totalMs += ms;
        existingValue.maxMs = Math.max(existingValue.maxMs || 0, ms);
        target[name] = existingValue;
    }

    function sanitizeTimingLabel(value) {
        return String(value || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64) || 'unknown';
    }

    function hasHookInChain(fn, property, token) {
        const seen = [];
        let current = typeof fn === 'function' ? fn : null;
        while (current && seen.indexOf(current) < 0) {
            if (current[property] === token) return true;
            seen.push(current);
            current = typeof current.__trOriginal === 'function' ? current.__trOriginal : null;
        }
        return false;
    }

    function safeFileTimestamp() {
        try {
            return new Date().toISOString().replace(/[:.]/g, '-');
        } catch (_) {
            return String(Date.now());
        }
    }

    defineRuntimeModule('runtime.performanceProfilerSupport', {
        DEFAULT_TARGET_FPS,
        DEFAULT_ROLLING_FRAMES,
        DEFAULT_AUTO_DUMP_INTERVAL_MS,
        DEFAULT_TOP_LIMIT,
        createProfilerPlatform,
        resolveProfilerOptions,
        toPlainCounterObject,
        timingRows,
        topRows,
        hasFrameData,
        addTiming,
        sanitizeTimingLabel,
        hasHookInChain,
    });
})();
