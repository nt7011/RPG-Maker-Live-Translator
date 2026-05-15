// Performance profiler shared by hook modules.
//
// This file owns the live profiler lifecycle: enable/disable, frame capture,
// engine stage hooks, counters, timings, and snapshot dumps. Low-level option
// parsing, platform APIs, and formatting helpers live in
// runtime/performance-profiler-support.js so this module reads as the runtime
// API surface.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/performance-profiler.js.');
    }

    const profilerSupport = requireModule('runtime.performanceProfilerSupport');
    const {
        DEFAULT_TARGET_FPS,
        DEFAULT_ROLLING_FRAMES,
        DEFAULT_AUTO_DUMP_INTERVAL_MS,
        DEFAULT_TOP_LIMIT,
        addTiming,
        createProfilerPlatform,
        hasFrameData,
        hasHookInChain,
        resolveProfilerOptions,
        sanitizeTimingLabel,
        timingRows,
        topRows,
        toPlainCounterObject,
    } = profilerSupport;

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

        let config = resolveProfilerOptions(settings && settings.performanceProfiler);
        const platform = createProfilerPlatform({
            globalScope,
            getConfig: () => config,
        });
        const {
            now,
            requestFrame,
            cancelFrame,
            defaultDumpDirectory,
            autoDumpPath,
            writeProfilerSnapshotToFile,
        } = platform;
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
        const domainTotals = new Map();
        const domainTimings = new Map();
        const domainTopGroups = new Map();
        const dumpHistory = [];
        const DUMP_HISTORY_LIMIT = 20;
        let lastDumpSnapshot = null;
        const ENGINE_STAGE_TOKEN = {};
        const DEFAULT_DOMAIN = 'translator';

        const normalizeMetricDomain = (value) => {
            const raw = String(value || DEFAULT_DOMAIN).trim();
            const safe = raw.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 48);
            return safe || DEFAULT_DOMAIN;
        };

        const resolveMetricDomain = (optionsArg) => {
            if (typeof optionsArg === 'string') return normalizeMetricDomain(optionsArg);
            if (optionsArg && typeof optionsArg === 'object') {
                return normalizeMetricDomain(optionsArg.domain || optionsArg.category || optionsArg.workload);
            }
            return DEFAULT_DOMAIN;
        };

        const getNestedMap = (root, domain) => {
            const key = normalizeMetricDomain(domain);
            let map = root.get(key);
            if (!map) {
                map = new Map();
                root.set(key, map);
            }
            return map;
        };

        const ensureFrameDomain = (frame, domain) => {
            if (!frame) return null;
            if (!frame.domains || typeof frame.domains !== 'object') frame.domains = Object.create(null);
            const key = normalizeMetricDomain(domain);
            if (!frame.domains[key]) {
                frame.domains[key] = {
                    counters: Object.create(null),
                    timings: Object.create(null),
                };
            }
            return frame.domains[key];
        };

        const addCounter = (target, name, value) => {
            if (!target || !name) return;
            target[name] = (target[name] || 0) + value;
        };

        const addMapCounter = (target, name, value) => {
            if (!target || !name) return;
            target.set(name, (target.get(name) || 0) + value);
        };

        const summarizeDomainTimings = (map) => {
            let totalMs = 0;
            let count = 0;
            let maxMs = 0;
            try {
                map.forEach((value) => {
                    totalMs += Number(value && value.totalMs) || 0;
                    count += Number(value && value.count) || 0;
                    maxMs = Math.max(maxMs, Number(value && value.maxMs) || 0);
                });
            } catch (_) {}
            return {
                count,
                totalMs: Math.round(totalMs * 100) / 100,
                maxMs: Math.round(maxMs * 100) / 100,
            };
        };

        const domainSnapshot = (topLimit) => {
            const names = new Set();
            domainTotals.forEach((_, name) => names.add(name));
            domainTimings.forEach((_, name) => names.add(name));
            domainTopGroups.forEach((_, name) => names.add(name));
            const result = {};
            names.forEach((domain) => {
                const counters = domainTotals.get(domain) || new Map();
                const timingMap = domainTimings.get(domain) || new Map();
                const topMap = domainTopGroups.get(domain) || new Map();
                result[domain] = {
                    totals: toPlainCounterObject(counters),
                    timings: timingRows(timingMap),
                    top: topRows(topMap, topLimit),
                    summary: summarizeDomainTimings(timingMap),
                };
            });
            return result;
        };

        const frameDomainSnapshot = (frame) => {
            const result = {};
            try {
                Object.keys(frame && frame.domains || {}).forEach((domain) => {
                    const entry = frame.domains[domain];
                    result[domain] = {
                        counters: Object.assign({}, entry && entry.counters),
                        timings: timingRows(new Map(Object.entries(entry && entry.timings || {}))),
                    };
                });
            } catch (_) {}
            return result;
        };

        const getFrameTiming = (frame, domain, name) => {
            try {
                const domainEntry = frame && frame.domains && frame.domains[domain];
                const value = domainEntry && domainEntry.timings && domainEntry.timings[name];
                return value && typeof value === 'object' ? value : null;
            } catch (_) {
                return null;
            }
        };

        const domainMatches = (domain, selector) => {
            const value = normalizeMetricDomain(domain);
            const target = normalizeMetricDomain(selector);
            if (value === target) return true;
            if (target === 'translator') {
                return value.indexOf('translator-') === 0 || value.indexOf('translator.') === 0;
            }
            return false;
        };

        const getFrameTimingGroup = (frame, domainSelector, name) => {
            const aggregate = { count: 0, totalMs: 0, maxMs: 0 };
            try {
                Object.keys(frame && frame.domains || {}).forEach((domain) => {
                    if (!domainMatches(domain, domainSelector)) return;
                    const domainEntry = frame.domains[domain];
                    const value = domainEntry && domainEntry.timings && domainEntry.timings[name];
                    if (!value || typeof value !== 'object') return;
                    aggregate.count += Number(value.count) || 0;
                    aggregate.totalMs += Number(value.totalMs) || 0;
                    aggregate.maxMs = Math.max(aggregate.maxMs, Number(value.maxMs) || 0);
                });
            } catch (_) {}
            return aggregate.count || aggregate.totalMs || aggregate.maxMs ? aggregate : null;
        };

        const getFrameCounter = (frame, domain, name) => {
            try {
                const domainEntry = frame && frame.domains && frame.domains[domain];
                const value = domainEntry && domainEntry.counters ? domainEntry.counters[name] : undefined;
                return Number.isFinite(Number(value)) ? Number(value) : 0;
            } catch (_) {
                return 0;
            }
        };

        const timingTotal = (timing) => Number(timing && timing.totalMs) || 0;
        const timingCount = (timing) => Number(timing && timing.count) || 0;
        const timingMax = (timing) => Number(timing && timing.maxMs) || 0;
        const roundMetric = (value) => Math.round((Number(value) || 0) * 100) / 100;

        const topFrameTimingRows = (frame, domain, limit = 5) => {
            try {
                const aggregate = new Map();
                Object.keys(frame && frame.domains || {}).forEach((entryDomain) => {
                    if (!domainMatches(entryDomain, domain)) return;
                    const domainEntry = frame.domains[entryDomain];
                    Object.keys(domainEntry && domainEntry.timings || {}).forEach((name) => {
                        const value = domainEntry.timings[name];
                        if (!value || typeof value !== 'object') return;
                        const existing = aggregate.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
                        existing.count += Number(value.count) || 0;
                        existing.totalMs += Number(value.totalMs) || 0;
                        existing.maxMs = Math.max(existing.maxMs, Number(value.maxMs) || 0);
                        aggregate.set(name, existing);
                    });
                });
                return timingRows(aggregate).slice(0, limit);
            } catch (_) {
                return [];
            }
        };

        const frameTranslatorDominantMs = (frame) => {
            const names = [
                'spriteText.frame.ms',
                'bitmap.drawText.native.ms',
                'bitmapDrawHub.flush.ms',
                'bitmapText.flushAggregatedLines.ms',
                'bitmapText.drawBatch.ms',
                'windowText.drawBatch.consume.ms',
                'spriteText.drawBatch.consume.ms',
                'windowText.surfaceDraw.ms',
                'spriteText.surfaceDraw.ms',
                'bitmap.mutation.handle.ms',
                'bitmap.mutation.notify.ms',
            ];
            let maxValue = 0;
            names.forEach((name) => {
                maxValue = Math.max(maxValue, timingTotal(getFrameTimingGroup(frame, 'translator', name)));
            });
            return maxValue;
        };

        const summarizeHotFrameSide = (frame) => {
            if (!frame) return null;
            const engineRoot = getFrameTiming(frame, 'game', 'engine.stage.root.ms');
            const updateMain = getFrameTiming(frame, 'game', 'engine.stage.SceneManager.updateMain.ms');
            const updateScene = getFrameTiming(frame, 'game', 'engine.stage.SceneManager.updateScene.ms');
            const renderScene = getFrameTiming(frame, 'game', 'engine.stage.SceneManager.renderScene.ms');
            const graphicsRender = getFrameTiming(frame, 'game', 'engine.stage.Graphics.render.ms');
            const changeScene = getFrameTiming(frame, 'game', 'engine.stage.SceneManager.changeScene.ms');
            const nativeDraw = getFrameTiming(frame, 'game', 'bitmap.drawText.native.ms');
            const nativeMutation = getFrameTiming(frame, 'game', 'bitmap.mutation.native.ms');
            const hookDraw = getFrameTiming(frame, 'hook', 'bitmap.drawText.hook.ms');
            const translatorNativeDraw = getFrameTimingGroup(frame, 'translator', 'bitmap.drawText.native.ms');
            const spriteFrame = getFrameTimingGroup(frame, 'translator', 'spriteText.frame.ms');
            const spriteParents = getFrameTimingGroup(frame, 'translator', 'spriteText.processParents.ms');
            const drawHubFlush = getFrameTimingGroup(frame, 'translator', 'bitmapDrawHub.flush.ms');
            const drawHubSubscriber = getFrameTimingGroup(frame, 'translator', 'bitmapDrawHub.subscriber.ms');
            const bitmapFallback = getFrameTimingGroup(frame, 'translator', 'bitmapText.flushAggregatedLines.ms');
            const bitmapBatch = getFrameTimingGroup(frame, 'translator', 'bitmapText.drawBatch.ms');
            const windowBatch = getFrameTimingGroup(frame, 'translator', 'windowText.drawBatch.consume.ms');
            const spriteBatch = getFrameTimingGroup(frame, 'translator', 'spriteText.drawBatch.consume.ms');
            const translatorMutation = getFrameTimingGroup(frame, 'translator', 'bitmap.mutation.handle.ms');
            return {
                id: frame.id,
                durationMs: roundMetric(frame.durationMs),
                slow: !!frame.slow,
                dropped: !!frame.dropped,
                game: {
                    engineRootMs: roundMetric(timingTotal(engineRoot)),
                    updateMainMs: roundMetric(timingTotal(updateMain)),
                    updateSceneMs: roundMetric(timingTotal(updateScene)),
                    updateSceneCalls: timingCount(updateScene),
                    renderSceneMs: roundMetric(timingTotal(renderScene)),
                    graphicsRenderMs: roundMetric(timingTotal(graphicsRender)),
                    changeSceneMs: roundMetric(timingTotal(changeScene)),
                    nativeBitmapDrawMs: roundMetric(timingTotal(nativeDraw)),
                    nativeBitmapDrawCalls: timingCount(nativeDraw),
                    nativeBitmapDrawMaxMs: roundMetric(timingMax(nativeDraw)),
                    nativeMutationMs: roundMetric(timingTotal(nativeMutation)),
                },
                hook: {
                    bitmapDrawHookMs: roundMetric(timingTotal(hookDraw)),
                    bitmapDrawHookCalls: timingCount(hookDraw) || getFrameCounter(frame, 'hook', 'bitmap.drawText.calls'),
                    bitmapDrawHookMaxMs: roundMetric(timingMax(hookDraw)),
                },
                translator: {
                    dominantMs: roundMetric(frameTranslatorDominantMs(frame)),
                    nativeBitmapDrawMs: roundMetric(timingTotal(translatorNativeDraw)),
                    nativeBitmapDrawCalls: timingCount(translatorNativeDraw),
                    nativeBitmapDrawMaxMs: roundMetric(timingMax(translatorNativeDraw)),
                    spriteFrameMs: roundMetric(timingTotal(spriteFrame)),
                    spriteProcessParentsMs: roundMetric(timingTotal(spriteParents)),
                    drawHubFlushMs: roundMetric(timingTotal(drawHubFlush)),
                    drawHubFlushCalls: timingCount(drawHubFlush),
                    drawHubUnits: getFrameCounter(frame, 'translator', 'bitmapDrawHub.flush.units'),
                    drawHubSubscriberMs: roundMetric(timingTotal(drawHubSubscriber)),
                    bitmapFallbackMs: roundMetric(timingTotal(bitmapFallback)),
                    bitmapBatchMs: roundMetric(timingTotal(bitmapBatch)),
                    windowBatchMs: roundMetric(timingTotal(windowBatch)),
                    spriteBatchMs: roundMetric(timingTotal(spriteBatch)),
                    bitmapMutationHandleMs: roundMetric(timingTotal(translatorMutation)),
                },
                top: {
                    game: topFrameTimingRows(frame, 'game', 5),
                    hook: topFrameTimingRows(frame, 'hook', 3),
                    translator: topFrameTimingRows(frame, 'translator', 8),
                },
            };
        };

        const chooseHotFrameAttribution = (current, previous) => {
            const budget = Number(config.targetFrameMs) || Number(config.slowFrameMs) || 25;
            const candidates = [];
            const addCandidate = (frame, frameRole, domain, metric, ms, weight = 1) => {
                const value = Number(ms) || 0;
                if (!frame || value <= 0) return;
                candidates.push({
                    frameRole,
                    frameId: frame.id,
                    domain,
                    metric,
                    ms: value,
                    score: value * weight,
                });
            };

            [previous, current].forEach((frame, index) => {
                const frameRole = index === 0 ? 'previous' : 'current';
                addCandidate(frame, frameRole, 'game', 'engine.stage.SceneManager.changeScene.ms', timingTotal(getFrameTiming(frame, 'game', 'engine.stage.SceneManager.changeScene.ms')), 1.35);
                addCandidate(frame, frameRole, 'game', 'engine.stage.root.ms', timingTotal(getFrameTiming(frame, 'game', 'engine.stage.root.ms')), frameRole === 'previous' ? 1.2 : 1);
                addCandidate(frame, frameRole, 'game', 'bitmap.drawText.native.ms', timingTotal(getFrameTiming(frame, 'game', 'bitmap.drawText.native.ms')), 0.9);
                addCandidate(frame, frameRole, 'translator', 'bitmap.drawText.native.ms', timingTotal(getFrameTimingGroup(frame, 'translator', 'bitmap.drawText.native.ms')), frameRole === 'previous' ? 1.15 : 1.05);
                addCandidate(frame, frameRole, 'translator', 'translator.dominant.ms', frameTranslatorDominantMs(frame), frameRole === 'previous' ? 1.1 : 1);
                addCandidate(frame, frameRole, 'hook', 'bitmap.drawText.hook.ms', timingTotal(getFrameTiming(frame, 'hook', 'bitmap.drawText.hook.ms')), 0.7);
            });

            candidates.sort((left, right) => right.score - left.score);
            const translatorBest = candidates
                .filter(candidate => candidate && candidate.domain === 'translator')
                .sort((left, right) => right.ms - left.ms)[0] || null;
            let best = candidates[0] || null;
            if (translatorBest
                && translatorBest.ms >= budget * 0.5
                && (!best || translatorBest.ms >= best.ms * 0.35)) {
                best = translatorBest;
            }
            const evidence = [];
            let likelyCause = 'unattributed-raf-delay';
            let confidence = 'low';

            if (best) {
                const bestMs = roundMetric(best.ms);
                if (best.domain === 'game' && best.metric === 'engine.stage.SceneManager.changeScene.ms' && best.ms >= budget) {
                    likelyCause = `${best.frameRole}-game-changeScene`;
                    confidence = 'high';
                    evidence.push(`${best.frameRole} frame SceneManager.changeScene took ${bestMs}ms`);
                } else if (best.domain === 'game' && best.metric === 'engine.stage.root.ms' && best.ms >= budget) {
                    likelyCause = `${best.frameRole}-game-engine`;
                    confidence = best.ms >= budget * 1.5 ? 'high' : 'medium';
                    evidence.push(`${best.frameRole} frame engine root took ${bestMs}ms`);
                } else if (best.domain === 'game' && best.metric === 'bitmap.drawText.native.ms' && best.ms >= budget * 0.5) {
                    likelyCause = `${best.frameRole}-native-bitmap-draw`;
                    confidence = 'medium';
                    evidence.push(`${best.frameRole} frame native Bitmap.drawText took ${bestMs}ms`);
                } else if (best.domain === 'translator' && best.ms >= budget * 0.35) {
                    likelyCause = `${best.frameRole}-translator-work`;
                    confidence = best.ms >= budget * 0.75 ? 'high' : 'medium';
                    evidence.push(`${best.frameRole} frame translator work reached ${bestMs}ms`);
                } else if (best.domain === 'hook' && best.ms >= budget * 0.25) {
                    likelyCause = `${best.frameRole}-hook-overhead`;
                    confidence = 'medium';
                    evidence.push(`${best.frameRole} frame bitmap hook took ${bestMs}ms`);
                } else {
                    evidence.push(`largest measured contributor was ${best.frameRole} ${best.domain} ${best.metric} at ${bestMs}ms`);
                }
            }

            if (previous && timingTotal(getFrameTiming(previous, 'game', 'engine.stage.root.ms')) >= budget) {
                evidence.push('previous frame engine root exceeded budget');
            }
            if (current && timingTotal(getFrameTiming(current, 'game', 'engine.stage.root.ms')) >= budget) {
                evidence.push('current frame engine root exceeded budget');
            }
            if (current && frameTranslatorDominantMs(current) >= budget * 0.35) {
                evidence.push('current frame translator work was material');
            }
            if (previous && frameTranslatorDominantMs(previous) >= budget * 0.35) {
                evidence.push('previous frame translator work was material');
            }

            return {
                likelyCause,
                confidence,
                dominant: best ? {
                    frameRole: best.frameRole,
                    frameId: best.frameId,
                    domain: best.domain,
                    metric: best.metric,
                    ms: roundMetric(best.ms),
                } : null,
                evidence: evidence.slice(0, 6),
            };
        };

        const buildHotFrameAttribution = (limit) => {
            const rowLimit = Math.max(1, Math.min(100, Number(limit) || config.topLimit || DEFAULT_TOP_LIMIT));
            const sourceFrames = frames.slice();
            const rows = [];
            const causeCounts = Object.create(null);
            sourceFrames.forEach((frame, index) => {
                if (!frame || !frame.slow) return;
                const previous = index > 0 ? sourceFrames[index - 1] : null;
                const attribution = chooseHotFrameAttribution(frame, previous);
                causeCounts[attribution.likelyCause] = (causeCounts[attribution.likelyCause] || 0) + 1;
                rows.push(Object.assign({
                    id: frame.id,
                    durationMs: roundMetric(frame.durationMs),
                    overBudgetMs: roundMetric(Math.max(0, (Number(frame.durationMs) || 0) - (Number(config.targetFrameMs) || 0))),
                    slow: !!frame.slow,
                    dropped: !!frame.dropped,
                    previousFrameId: previous ? previous.id : null,
                    current: summarizeHotFrameSide(frame),
                    previous: summarizeHotFrameSide(previous),
                }, attribution));
            });
            rows.sort((left, right) => right.durationMs - left.durationMs);
            return {
                note: 'RAF delay can be caused by work recorded on the current frame or the immediately previous profiler frame.',
                budgetMs: roundMetric(config.targetFrameMs),
                slowFrames: rows.length,
                droppedFrames: rows.filter(row => row && row.dropped).length,
                causes: Object.assign({}, causeCounts),
                rows: rows.slice(0, rowLimit),
            };
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
                    domains: Object.create(null),
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
                if (currentFrame.slow && config.autoDumpSlowFrames && shouldAutoDumpFrame(currentFrame)) {
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
                domains: Object.create(null),
            };
        };

        const shouldAutoDumpFrame = (frame) => {
            if (!frame) return false;
            const minFrameMs = Number(config.autoDumpMinFrameMs) || 0;
            return minFrameMs <= 0 || Number(frame.durationMs) >= minFrameMs;
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

        const engineStageStack = [];

        const recordEngineStageTiming = (label, start, errorThrown) => {
            const end = now();
            const elapsed = Math.max(0, end - start);
            const frame = engineStageStack.pop() || { childMs: 0 };
            if (!enabled || !Number.isFinite(start)) return;
            const childMs = Math.max(0, frame.childMs || 0);
            const selfMs = Math.max(0, elapsed - childMs);
            const safeLabel = sanitizeTimingLabel(label);
            if (engineStageStack.length) {
                const parent = engineStageStack[engineStageStack.length - 1];
                parent.childMs = Math.max(0, (parent.childMs || 0) + elapsed);
            } else {
                api.time('engine.stage.root.ms', elapsed, { domain: 'game' });
            }
            api.time(`engine.stage.${safeLabel}.ms`, elapsed, { domain: 'game' });
            api.time(`engine.stage.self.${safeLabel}.ms`, selfMs, { domain: 'game' });
            api.top('engine.stage.inclusiveTime', label, elapsed, { domain: 'game' });
            api.top('engine.stage.selfTime', label, selfMs, { domain: 'game' });
            if (errorThrown) api.count(`engine.stage.${safeLabel}.errors`, 1, { domain: 'game' });
        };

        const installEngineStageHook = (target, methodName, label) => {
            if (!target || typeof target[methodName] !== 'function') return false;
            const current = target[methodName];
            if (hasHookInChain(current, '__trPerfEngineStageHook', ENGINE_STAGE_TOKEN)) return true;
            const wrapped = function(...args) {
                if (!enabled) return current.apply(this, args);
                const start = now();
                engineStageStack.push({ label, childMs: 0 });
                api.count('engine.stage.calls', 1, { domain: 'game' });
                api.count(`engine.stage.${sanitizeTimingLabel(label)}.calls`, 1, { domain: 'game' });
                api.top('engine.stage.method', label, 1, { domain: 'game' });
                let failed = true;
                try {
                    const result = current.apply(this, args);
                    failed = false;
                    return result;
                } finally {
                    recordEngineStageTiming(label, start, failed);
                }
            };
            wrapped.__trOriginal = current;
            wrapped.__trPerfEngineStageHook = ENGINE_STAGE_TOKEN;
            target[methodName] = wrapped;
            return true;
        };

        const installEngineStageHooks = () => {
            if (!enabled) return false;
            let installed = false;
            try {
                const sceneManager = globalScope && globalScope.SceneManager;
                if (sceneManager) {
                    installed = installEngineStageHook(sceneManager, 'updateMain', 'SceneManager.updateMain') || installed;
                    installed = installEngineStageHook(sceneManager, 'updateScene', 'SceneManager.updateScene') || installed;
                    installed = installEngineStageHook(sceneManager, 'renderScene', 'SceneManager.renderScene') || installed;
                    installed = installEngineStageHook(sceneManager, 'changeScene', 'SceneManager.changeScene') || installed;
                }
            } catch (_) {}
            try {
                const graphics = globalScope && globalScope.Graphics;
                if (graphics) {
                    installed = installEngineStageHook(graphics, 'render', 'Graphics.render') || installed;
                    installed = installEngineStageHook(graphics, '_renderCanvas', 'Graphics._renderCanvas') || installed;
                    installed = installEngineStageHook(graphics, '_renderWebGL', 'Graphics._renderWebGL') || installed;
                }
            } catch (_) {}
            return installed;
        };

        const parseMeasureArgs = (args) => {
            if (!args || !args.length) return null;
            if (typeof args[1] === 'function') {
                return {
                    name: args[0],
                    fn: args[1],
                    domain: resolveMetricDomain(args[2]),
                };
            }
            return {
                domain: args[3] ? resolveMetricDomain(args[3]) : normalizeMetricDomain(args[0]),
                name: args[1],
                fn: args[2],
            };
        };

        const api = {
            __trProfilerApi: true,
            isEnabled: () => enabled,
            now,
            installEngineStageHooks,
            configure(rawOptions = {}) {
                config = resolveProfilerOptions(rawOptions);
                if (config.enabled) {
                    api.enable(config);
                } else if (enabled) {
                    api.disable();
                }
                return api;
            },
            enable(rawOptions = {}) {
                const merged = Object.assign({}, config, rawOptions || {}, { enabled: true });
                config = resolveProfilerOptions(merged);
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
                    targetFps: DEFAULT_TARGET_FPS,
                    rollingFrames: DEFAULT_ROLLING_FRAMES,
                    droppedFrameMultiplier: 2,
                    autoDumpSlowFrames: true,
                    autoDumpIncludeFrames: true,
                    autoDumpToFile: true,
                    autoDumpIntervalMs: DEFAULT_AUTO_DUMP_INTERVAL_MS,
                    topLimit: DEFAULT_TOP_LIMIT,
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
                domainTotals.clear();
                domainTimings.clear();
                domainTopGroups.clear();
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
            count(name, amount = 1, optionsArg = null) {
                if (!enabled || !name) return;
                const value = Number.isFinite(Number(amount)) ? Number(amount) : 1;
                const domain = resolveMetricDomain(optionsArg);
                const frame = ensureFrame();
                addCounter(frame.counters, name, value);
                addMapCounter(totals, name, value);
                const frameDomain = ensureFrameDomain(frame, domain);
                if (frameDomain) addCounter(frameDomain.counters, name, value);
                addMapCounter(getNestedMap(domainTotals, domain), name, value);
            },
            time(name, ms, optionsArg = null) {
                if (!enabled || !name || !Number.isFinite(ms) || ms < 0) return;
                const domain = resolveMetricDomain(optionsArg);
                const frame = ensureFrame();
                addTiming(frame.timings, name, ms);
                const frameDomain = ensureFrameDomain(frame, domain);
                if (frameDomain) addTiming(frameDomain.timings, name, ms);
                const existingValue = timings.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
                existingValue.count += 1;
                existingValue.totalMs += ms;
                existingValue.maxMs = Math.max(existingValue.maxMs || 0, ms);
                timings.set(name, existingValue);
                const domainMap = getNestedMap(domainTimings, domain);
                const domainValue = domainMap.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
                domainValue.count += 1;
                domainValue.totalMs += ms;
                domainValue.maxMs = Math.max(domainValue.maxMs || 0, ms);
                domainMap.set(name, domainValue);
            },
            top(group, label, amount = 1, optionsArg = null) {
                if (!enabled || !group || label === null || label === undefined) return;
                const text = String(label || 'unknown');
                const value = Number.isFinite(Number(amount)) ? Number(amount) : 1;
                const domain = resolveMetricDomain(optionsArg);
                let groupMap = topGroups.get(group);
                if (!groupMap) {
                    groupMap = new Map();
                    topGroups.set(group, groupMap);
                }
                groupMap.set(text, (groupMap.get(text) || 0) + value);
                const domainGroups = getNestedMap(domainTopGroups, domain);
                let domainGroup = domainGroups.get(group);
                if (!domainGroup) {
                    domainGroup = new Map();
                    domainGroups.set(group, domainGroup);
                }
                domainGroup.set(text, (domainGroup.get(text) || 0) + value);
            },
            countIn(domain, name, amount = 1) {
                return api.count(name, amount, { domain });
            },
            timeIn(domain, name, ms) {
                return api.time(name, ms, { domain });
            },
            topIn(domain, group, label, amount = 1) {
                return api.top(group, label, amount, { domain });
            },
            measure(...args) {
                const parsed = parseMeasureArgs(args);
                if (!parsed || typeof parsed.fn !== 'function') return undefined;
                if (!enabled) return parsed.fn();
                const start = now();
                let result;
                try {
                    result = parsed.fn();
                } catch (error) {
                    api.time(parsed.name, now() - start, { domain: parsed.domain });
                    throw error;
                }
                if (result && typeof result.then === 'function') {
                    return result.then(
                        (value) => {
                            api.time(parsed.name, now() - start, { domain: parsed.domain });
                            return value;
                        },
                        (error) => {
                            api.time(parsed.name, now() - start, { domain: parsed.domain });
                            throw error;
                        }
                    );
                }
                api.time(parsed.name, now() - start, { domain: parsed.domain });
                return result;
            },
            measureIn(domain, name, fn) {
                return api.measure(domain, name, fn);
            },
            snapshot(optionsArg = {}) {
                const opts = optionsArg && typeof optionsArg === 'object' ? optionsArg : {};
                const includeFrames = opts.includeFrames !== false;
                const topLimit = Number.isFinite(Number(opts.topLimit)) ? Number(opts.topLimit) : config.topLimit;
                const hotFrameLimit = Number.isFinite(Number(opts.hotFrameLimit)) ? Number(opts.hotFrameLimit) : topLimit;
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
                        domains: frameDomainSnapshot(frame),
                    }))
                    : undefined;
                return {
                    enabled,
                    options: Object.assign({}, config),
                    dumpDirectory: defaultDumpDirectory(),
                    elapsedMs: Math.round(elapsedMs),
                    frames: frames.length,
                    slowFrames: frames.filter(frame => frame && frame.slow).length,
                    droppedFrames: frames.filter(frame => frame && frame.dropped).length,
                    totals: toPlainCounterObject(totals),
                    timings: timingRows(timings),
                    top: topRows(topGroups, topLimit),
                    domains: domainSnapshot(topLimit),
                    hotFrames: buildHotFrameAttribution(hotFrameLimit),
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

    function requireModule(name) {
        if (typeof requireRuntimeModule === 'function') {
            return requireRuntimeModule(name);
        }
        const modules = globalScope.LiveTranslatorModules || {};
        if (modules[name]) return modules[name];
        return String(name || '').split('.').reduce((current, part) => {
            return current && current[part] ? current[part] : null;
        }, modules);
    }

    defineRuntimeModule('runtime.performanceProfiler', {
        createLiveTranslatorPerf,
    });
})();
