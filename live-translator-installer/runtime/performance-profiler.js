// Performance profiler support shared by hook modules.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/performance-profiler.js.');
    }

    function createLiveTranslatorPerf(options = {}) {
        const {
            settings,
            logger,
        } = options;

        const existing = globalScope.LiveTranslatorPerf;
        if (existing && existing.__trProfilerApi && typeof existing.configure === 'function') {
            existing.configure(settings && settings.performanceProfiler);
            return existing;
        }

        const defaultOptions = {
            enabled: false,
            rollingFrames: 300,
            slowFrameMs: 1000 / 60,
            targetFrameMs: 0,
            droppedFrameMultiplier: 2,
            autoDumpSlowFrames: false,
            autoDumpIncludeFrames: true,
            autoDumpToFile: false,
            autoDumpDirectory: '',
            autoDumpIntervalMs: 5000,
            topLimit: 12,
        };

        const now = () => {
            try {
                if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
                    return performance.now();
                }
            } catch (_) {}
            return Date.now();
        };

        const requestFrame = (callback) => {
            try {
                const fn = globalScope && typeof globalScope.requestAnimationFrame === 'function'
                    ? globalScope.requestAnimationFrame
                    : (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
                if (fn) return fn.call(globalScope, callback);
            } catch (_) {}
            return setTimeout(() => callback(now()), 16);
        };

        const cancelFrame = (handle) => {
            try {
                const fn = globalScope && typeof globalScope.cancelAnimationFrame === 'function'
                    ? globalScope.cancelAnimationFrame
                    : (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
                if (fn) {
                    fn.call(globalScope, handle);
                    return;
                }
            } catch (_) {}
            try { clearTimeout(handle); } catch (_) {}
        };

        const resolveOptions = (raw = {}) => {
            const src = raw && typeof raw === 'object' ? raw : {};
            const next = Object.assign({}, defaultOptions, src);
            next.enabled = next.enabled === true;
            next.rollingFrames = Math.max(20, Math.min(5000, Number(next.rollingFrames) || defaultOptions.rollingFrames));
            next.slowFrameMs = Math.max(1, Number(next.slowFrameMs) || defaultOptions.slowFrameMs);
            next.targetFrameMs = Math.max(0, Number(next.targetFrameMs) || 0);
            next.droppedFrameMultiplier = Math.max(1.1, Number(next.droppedFrameMultiplier) || defaultOptions.droppedFrameMultiplier);
            next.autoDumpSlowFrames = next.autoDumpSlowFrames === true;
            next.autoDumpIncludeFrames = next.autoDumpIncludeFrames !== false;
            next.autoDumpToFile = next.autoDumpToFile === true;
            next.autoDumpDirectory = typeof next.autoDumpDirectory === 'string' ? next.autoDumpDirectory.trim() : '';
            next.autoDumpIntervalMs = Math.max(250, Number(next.autoDumpIntervalMs) || defaultOptions.autoDumpIntervalMs);
            next.topLimit = Math.max(1, Math.min(100, Number(next.topLimit) || defaultOptions.topLimit));
            return next;
        };

        let config = resolveOptions(settings && settings.performanceProfiler);
        let enabled = config.enabled;
        let startedAt = now();
        let frameSeq = 0;
        let currentFrame = null;
        let rafHandle = null;
        let lastRafAt = 0;
        let lastAutoDumpAt = -Infinity;
        const frames = [];
        const totals = new Map();
        const timings = new Map();
        const topGroups = new Map();
        const dumpHistory = [];
        const DUMP_HISTORY_LIMIT = 20;
        let lastDumpSnapshot = null;

        const toPlainCounterObject = (map) => {
            const rows = {};
            try {
                Array.from(map.entries())
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([key, value]) => {
                        rows[key] = value;
                    });
            } catch (_) {}
            return rows;
        };

        const timingRows = (map) => {
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
        };

        const topRows = (limit = config.topLimit) => {
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
        };

        const exposeDumpSnapshot = (snapshot, metadata = {}) => {
            if (!snapshot || typeof snapshot !== 'object') return snapshot;
            const exposed = Object.assign({}, snapshot, {
                dumpedAt: new Date().toISOString(),
                dumpMetadata: Object.assign({}, metadata),
            });
            lastDumpSnapshot = exposed;
            dumpHistory.push(exposed);
            while (dumpHistory.length > DUMP_HISTORY_LIMIT) dumpHistory.shift();
            try { globalScope.LiveTranslatorPerfLastDump = exposed; } catch (_) {}
            try { globalScope.LiveTranslatorPerfDumpHistory = dumpHistory; } catch (_) {}
            return exposed;
        };

        const safeFileTimestamp = () => {
            try {
                return new Date().toISOString().replace(/[:.]/g, '-');
            } catch (_) {
                return String(Date.now());
            }
        };

        const resolveNodeFileApi = () => {
            try {
                const req = typeof require === 'function'
                    ? require
                    : (globalScope && typeof globalScope.require === 'function' ? globalScope.require : null);
                if (!req) return null;
                const fs = req('fs');
                const path = req('path');
                return { fs, path };
            } catch (_) {
                return null;
            }
        };

        const defaultDumpPath = (prefix = 'live-translator-perf') => {
            const nodeApi = resolveNodeFileApi();
            if (!nodeApi || !nodeApi.path) return null;
            let base = '.';
            try {
                if (typeof process !== 'undefined' && process && typeof process.cwd === 'function') {
                    base = process.cwd();
                }
            } catch (_) {}
            return nodeApi.path.join(base, `${prefix}-${safeFileTimestamp()}.json`);
        };

        const autoDumpPath = () => {
            const nodeApi = resolveNodeFileApi();
            if (!nodeApi || !nodeApi.path) return null;
            const directory = config && config.autoDumpDirectory ? config.autoDumpDirectory : '';
            if (directory) {
                return nodeApi.path.join(directory, `live-translator-perf-auto-${safeFileTimestamp()}.json`);
            }
            return defaultDumpPath('live-translator-perf-auto');
        };

        const writeProfilerSnapshotToFile = (snapshot, filePath = null) => {
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
        };

        const hasFrameData = (frame) => {
            if (!frame) return false;
            if (frame.slow) return true;
            if (frame.counters && Object.keys(frame.counters).length) return true;
            if (frame.timings && Object.keys(frame.timings).length) return true;
            return false;
        };

        const ensureFrame = () => {
            if (!currentFrame) {
                currentFrame = {
                    id: frameSeq,
                    startedAt: now(),
                    durationMs: 0,
                    slow: false,
                    dropped: false,
                    counters: Object.create(null),
                    timings: Object.create(null),
                };
            }
            return currentFrame;
        };

        const commitFrame = (timestamp, durationMs = 0) => {
            if (currentFrame) {
                currentFrame.durationMs = Number.isFinite(durationMs) && durationMs > 0
                    ? durationMs
                    : Math.max(0, timestamp - currentFrame.startedAt);
                currentFrame.slow = currentFrame.durationMs >= config.slowFrameMs;
                currentFrame.dropped = config.targetFrameMs > 0
                    && currentFrame.durationMs >= config.targetFrameMs * config.droppedFrameMultiplier;
                if (currentFrame.dropped) {
                    currentFrame.slow = true;
                    currentFrame.frameBudgetMs = config.targetFrameMs;
                }
                if (hasFrameData(currentFrame)) {
                    frames.push(currentFrame);
                    while (frames.length > config.rollingFrames) frames.shift();
                }
                if (currentFrame.slow && config.autoDumpSlowFrames) {
                    const elapsed = timestamp - lastAutoDumpAt;
                    if (elapsed >= config.autoDumpIntervalMs) {
                        lastAutoDumpAt = timestamp;
                        try {
                            const reason = currentFrame.dropped ? 'dropped frame' : 'slow frame';
                            const snapshot = api.dump({
                                includeFrames: config.autoDumpIncludeFrames,
                                topLimit: config.topLimit,
                                metadata: {
                                    type: 'auto',
                                    reason,
                                    frameDurationMs: Math.round(currentFrame.durationMs * 100) / 100,
                                    frameId: currentFrame.id,
                                },
                            });
                            if (config.autoDumpToFile) {
                                try {
                                    const targetPath = autoDumpPath();
                                    if (snapshot.dumpMetadata && targetPath) snapshot.dumpMetadata.filePath = targetPath;
                                    const filePath = writeProfilerSnapshotToFile(snapshot, targetPath);
                                    if (snapshot.dumpMetadata) snapshot.dumpMetadata.filePath = filePath;
                                    snapshot.autoDumpFilePath = filePath;
                                } catch (writeError) {
                                    const message = writeError && writeError.message ? writeError.message : String(writeError || 'unknown error');
                                    if (snapshot.dumpMetadata) snapshot.dumpMetadata.writeError = message;
                                    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
                                        console.warn(`[LiveTranslatorPerf] Auto dump file write failed: ${message}`, writeError);
                                    }
                                }
                            }
                            if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
                                const fileSuffix = snapshot && snapshot.autoDumpFilePath ? ` -> ${snapshot.autoDumpFilePath}` : '';
                                console.warn(`[LiveTranslatorPerf] Auto dump: ${reason} ${Math.round(currentFrame.durationMs * 100) / 100}ms${fileSuffix}`, snapshot);
                            }
                        } catch (_) {}
                    }
                }
            }
            frameSeq++;
            currentFrame = {
                id: frameSeq,
                startedAt: timestamp,
                durationMs: 0,
                slow: false,
                dropped: false,
                counters: Object.create(null),
                timings: Object.create(null),
            };
        };

        const scheduleFrameLoop = () => {
            if (!enabled || rafHandle) return;
            const tick = (timestamp) => {
                rafHandle = null;
                if (!enabled) return;
                const ts = Number.isFinite(Number(timestamp)) ? Number(timestamp) : now();
                if (!lastRafAt) {
                    lastRafAt = ts;
                    ensureFrame().startedAt = ts;
                } else {
                    const delta = Math.max(0, ts - lastRafAt);
                    lastRafAt = ts;
                    commitFrame(ts, delta);
                }
                scheduleFrameLoop();
            };
            rafHandle = requestFrame(tick);
        };

        const cancelFrameLoop = () => {
            if (rafHandle) cancelFrame(rafHandle);
            rafHandle = null;
            lastRafAt = 0;
        };

        const addTiming = (target, name, ms) => {
            if (!target || !name || !Number.isFinite(ms) || ms < 0) return;
            const existingValue = target[name] || { count: 0, totalMs: 0, maxMs: 0 };
            existingValue.count += 1;
            existingValue.totalMs += ms;
            existingValue.maxMs = Math.max(existingValue.maxMs || 0, ms);
            target[name] = existingValue;
        };

        const api = {
            __trProfilerApi: true,
            isEnabled: () => enabled,
            now,
            configure(rawOptions = {}) {
                config = resolveOptions(rawOptions);
                if (config.enabled) {
                    api.enable(config);
                } else if (enabled) {
                    api.disable();
                }
                return api;
            },
            enable(rawOptions = {}) {
                const merged = Object.assign({}, config, rawOptions || {}, { enabled: true });
                config = resolveOptions(merged);
                enabled = true;
                startedAt = now();
                lastAutoDumpAt = -Infinity;
                ensureFrame();
                scheduleFrameLoop();
                return api;
            },
            startSlowFrameCapture(rawOptions = {}) {
                api.disable();
                api.reset();
                return api.enable(Object.assign({
                    rollingFrames: 1200,
                    slowFrameMs: 1000 / 60,
                    targetFrameMs: 1000 / 60,
                    droppedFrameMultiplier: 2,
                    autoDumpSlowFrames: true,
                    autoDumpIncludeFrames: true,
                    autoDumpToFile: true,
                    autoDumpIntervalMs: 5000,
                    topLimit: 25,
                }, rawOptions || {}));
            },
            disable() {
                enabled = false;
                cancelFrameLoop();
                return api;
            },
            reset() {
                frames.length = 0;
                totals.clear();
                timings.clear();
                topGroups.clear();
                dumpHistory.length = 0;
                lastDumpSnapshot = null;
                try { globalScope.LiveTranslatorPerfLastDump = null; } catch (_) {}
                try { globalScope.LiveTranslatorPerfDumpHistory = dumpHistory; } catch (_) {}
                currentFrame = null;
                frameSeq = 0;
                startedAt = now();
                lastAutoDumpAt = -Infinity;
                if (enabled) {
                    ensureFrame();
                    scheduleFrameLoop();
                }
                return api;
            },
            count(name, amount = 1) {
                if (!enabled || !name) return;
                const value = Number.isFinite(Number(amount)) ? Number(amount) : 1;
                const frame = ensureFrame();
                frame.counters[name] = (frame.counters[name] || 0) + value;
                totals.set(name, (totals.get(name) || 0) + value);
            },
            time(name, ms) {
                if (!enabled || !name || !Number.isFinite(ms) || ms < 0) return;
                const frame = ensureFrame();
                addTiming(frame.timings, name, ms);
                const existingValue = timings.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
                existingValue.count += 1;
                existingValue.totalMs += ms;
                existingValue.maxMs = Math.max(existingValue.maxMs || 0, ms);
                timings.set(name, existingValue);
            },
            top(group, label, amount = 1) {
                if (!enabled || !group || label === null || label === undefined) return;
                const text = String(label || 'unknown');
                const value = Number.isFinite(Number(amount)) ? Number(amount) : 1;
                let groupMap = topGroups.get(group);
                if (!groupMap) {
                    groupMap = new Map();
                    topGroups.set(group, groupMap);
                }
                groupMap.set(text, (groupMap.get(text) || 0) + value);
            },
            measure(name, fn) {
                if (typeof fn !== 'function') return undefined;
                if (!enabled) return fn();
                const start = now();
                try {
                    return fn();
                } finally {
                    api.time(name, now() - start);
                }
            },
            snapshot(optionsArg = {}) {
                const opts = optionsArg && typeof optionsArg === 'object' ? optionsArg : {};
                const includeFrames = opts.includeFrames !== false;
                const topLimit = Number.isFinite(Number(opts.topLimit)) ? Number(opts.topLimit) : config.topLimit;
                const elapsedMs = Math.max(0, now() - startedAt);
                const recentFrames = includeFrames
                    ? frames.slice(-Math.min(frames.length, config.rollingFrames)).map((frame) => ({
                        id: frame.id,
                        durationMs: Math.round((frame.durationMs || 0) * 100) / 100,
                        slow: !!frame.slow,
                        dropped: !!frame.dropped,
                        frameBudgetMs: frame.frameBudgetMs,
                        counters: Object.assign({}, frame.counters),
                        timings: timingRows(new Map(Object.entries(frame.timings || {}))),
                    }))
                    : undefined;
                return {
                    enabled,
                    options: Object.assign({}, config),
                    elapsedMs: Math.round(elapsedMs),
                    frames: frames.length,
                    slowFrames: frames.filter(frame => frame && frame.slow).length,
                    droppedFrames: frames.filter(frame => frame && frame.dropped).length,
                    totals: toPlainCounterObject(totals),
                    timings: timingRows(timings),
                    top: topRows(topLimit),
                    recentFrames,
                };
            },
            dump(optionsArg = {}) {
                const opts = optionsArg && typeof optionsArg === 'object' ? optionsArg : {};
                const snapshot = exposeDumpSnapshot(api.snapshot(opts), opts.metadata || { type: 'manual' });
                try {
                    if (typeof console !== 'undefined' && console) {
                        const group = console.groupCollapsed || console.group;
                        if (typeof group === 'function') group.call(console, '[LiveTranslatorPerf]');
                        if (typeof console.log === 'function') {
                            console.log('snapshot', snapshot);
                        }
                        if (typeof console.table === 'function') {
                            console.table(snapshot.timings);
                            console.table(Object.keys(snapshot.totals).map(name => ({ name, count: snapshot.totals[name] })));
                            Object.keys(snapshot.top || {}).forEach((groupName) => {
                                console.table(snapshot.top[groupName].map(row => Object.assign({ group: groupName }, row)));
                            });
                        } else if (typeof console.log === 'function') {
                            console.log(snapshot);
                        }
                        if (typeof console.groupEnd === 'function') console.groupEnd();
                    }
                } catch (_) {}
                return snapshot;
            },
            lastDump() {
                return lastDumpSnapshot;
            },
            dumpHistory() {
                return dumpHistory.slice();
            },
            toJson(snapshot = lastDumpSnapshot) {
                return JSON.stringify(snapshot || api.snapshot(), null, 2);
            },
            writeLastToFile(filePath = null) {
                const snapshot = lastDumpSnapshot || exposeDumpSnapshot(api.snapshot(), { type: 'writeLastToFile' });
                return writeProfilerSnapshotToFile(snapshot, filePath);
            },
            writeSnapshotToFile(snapshot, filePath = null) {
                return writeProfilerSnapshotToFile(snapshot || api.snapshot(), filePath);
            },
        };

        globalScope.LiveTranslatorPerf = api;
        try { globalScope.LiveTranslatorPerfDumpHistory = dumpHistory; } catch (_) {}
        if (enabled) {
            api.enable(config);
        }
        return api;
    }

    defineRuntimeModule('runtime.performanceProfiler', {
        createLiveTranslatorPerf,
    });
})();
