(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }

    function noop() {}

    function defaultPreview(text, max = 48) {
        const s = String(text ?? '').replace(/\s+/g, ' ').trim();
        if (s.length <= max) return s;
        return s.slice(0, Math.max(0, max - 1)) + '…';
    }

    function ensureTelemetry(telemetry) {
        if (telemetry && typeof telemetry.logTranslation === 'function') {
            return telemetry;
        }
        return {
            logTranslation: () => {},
        };
    }

    function normalizeCacheKey(text) {
        return String(text ?? '').trim();
    }

    function tokenizeNewlineMarkers(text) {
        let newlineIndex = 0;
        return String(text ?? '').replace(/\r?\n/g, () => `⟦NL${newlineIndex++}⟧`);
    }

    function untokenizeNewlineMarkers(text) {
        return String(text ?? '').replace(/⟦NL\d+⟧/g, '\n');
    }

    function deriveCacheKeyAliases(text) {
        const normalized = normalizeCacheKey(text);
        if (!normalized) return [];

        const aliases = [];
        const seen = new Set();
        const addAlias = (value) => {
            const key = normalizeCacheKey(value);
            if (!key || seen.has(key)) return;
            seen.add(key);
            aliases.push(key);
        };

        addAlias(normalized);

        if (/\r?\n/.test(normalized)) {
            addAlias(tokenizeNewlineMarkers(normalized));
        }
        if (/⟦NL\d+⟧/.test(normalized)) {
            addAlias(untokenizeNewlineMarkers(normalized));
        }

        return aliases;
    }

    const PRECACHE_ASSET_KEY = 'precacher/precache.json';
    const PRECACHE_LOG_FILE = 'precache.log';
    const CONTROL_CODE_PLACEHOLDER = '¤';
    const RAW_CONTROL_CODE_PATTERN = /\\(?:[A-Za-z0-9_#]+|[^\s\w])(?:\[[^\]]*\]|<[^>]*>)?/gu;
    const LINE_SEGMENT_SEPARATOR_PATTERN = /(\r\n|\r|\n|⟦NL\d+⟧)/g;
    const TEXT_BOUNDARY_PATTERN = /[A-Za-z0-9.!?,:;~\u2026\u3001\u3002\uFF01\uFF0C\uFF0E\uFF1A\uFF1B\uFF1F\uFF5E\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF66-\uFF9F-]/u;

    function getLoadedPrecacheRecords() {
        try {
            const assets = globalScope && globalScope.LiveTranslatorAssets;
            const asset = assets && (assets[PRECACHE_ASSET_KEY] || assets['precache.json']);
            if (asset && Array.isArray(asset.json)) return asset.json;
            if (Array.isArray(globalScope.LiveTranslatorPrecache)) return globalScope.LiveTranslatorPrecache;
        } catch (_) {}
        return [];
    }

    function createPrecacheLogSink(logger = {}) {
        let fs = null;
        let path = null;
        try {
            const req = (typeof require === 'function')
                ? require
                : (typeof globalScope.require === 'function' ? globalScope.require : null);
            if (req) {
                fs = req('fs');
                path = req('path');
            }
        } catch (_) {}

        const cwd = (() => {
            try {
                return (typeof process !== 'undefined' && process && typeof process.cwd === 'function')
                    ? process.cwd()
                    : null;
            } catch (_) {
                return null;
            }
        })();
        if (!fs || !path || !cwd) {
            return { write: () => {} };
        }

        const file = path.join(cwd, PRECACHE_LOG_FILE);
        const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : () => {};
        clearPrecacheRuntimeLogs(fs, path, cwd, warn);
        let chain = Promise.resolve();

        return {
            write(payload) {
                try {
                    const line = `${JSON.stringify(payload)}\n`;
                    chain = chain
                        .catch(() => {})
                        .then(() => fs.promises.appendFile(file, line, 'utf8'))
                        .catch((err) => {
                            warn('[Precache] Failed to append precache.log:', err);
                        });
                } catch (err) {
                    warn('[Precache] Failed to queue precache.log entry:', err);
                }
            }
        };
    }

    function clearPrecacheRuntimeLogs(fs, path, cwd, warn) {
        clearRuntimeLogFile(fs, path.join(cwd, PRECACHE_LOG_FILE), warn);
    }

    function clearRuntimeLogFile(fs, file, warn) {
        try {
            fs.writeFileSync(file, '', 'utf8');
        } catch (err) {
            warn(`[Precache] Failed to clear ${file}:`, err);
        }
    }

    function createCodedRaw(value) {
        return String(value ?? '').replace(RAW_CONTROL_CODE_PATTERN, CONTROL_CODE_PLACEHOLDER).trim();
    }

    function countControlMarkers(value) {
        const matches = String(value ?? '').match(new RegExp(CONTROL_CODE_PLACEHOLDER, 'g'));
        return matches ? matches.length : 0;
    }

    function addRawCodedAliases(aliases, record) {
        if (!record || typeof record.raw !== 'string' || !record.raw.trim()) return;
        aliases.push(...deriveCacheKeyAliases(createCodedRaw(record.raw)));
    }

    function createBoundaryTextParts(value) {
        const text = normalizeCacheKey(value);
        let start = -1;
        let end = -1;

        for (let index = 0; index < text.length; index += 1) {
            if (!TEXT_BOUNDARY_PATTERN.test(text.charAt(index))) continue;
            start = index;
            break;
        }

        if (start < 0) return null;

        for (let index = text.length - 1; index >= start; index -= 1) {
            if (!TEXT_BOUNDARY_PATTERN.test(text.charAt(index))) continue;
            end = index;
            break;
        }

        if (end < start) return null;
        return {
            leading: text.slice(0, start),
            body: normalizeCacheKey(text.slice(start, end + 1)),
            trailing: text.slice(end + 1),
            changed: start !== 0 || end !== text.length - 1,
        };
    }

    function createBoundaryTextAlias(value) {
        const parts = createBoundaryTextParts(value);
        if (!parts || !parts.changed) return '';
        return parts.body;
    }

    function createBoundaryTextKey(value) {
        const parts = createBoundaryTextParts(value);
        return parts ? parts.body : '';
    }

    function addUniqueFallbackAlias(table, key, record) {
        if (!key || !record) return;
        if (!table.has(key)) {
            table.set(key, record);
        }
    }

    function getBoundaryTextCandidates(value) {
        const input = normalizeCacheKey(value);
        const candidates = [];
        const seen = new Set();
        const addCandidate = (candidate) => {
            const key = normalizeCacheKey(candidate);
            if (!key || seen.has(key)) return;
            seen.add(key);
            candidates.push(key);
        };

        addCandidate(input);
        addCandidate(createBoundaryTextAlias(input));
        return candidates;
    }

    function splitEdgeControlMarkers(value) {
        const text = String(value ?? '');
        const marker = CONTROL_CODE_PLACEHOLDER;
        const legacyEdgeFragment = `${marker}(?:<${marker}>)?`;
        const leadingMatch = text.match(new RegExp(`^(?:${legacyEdgeFragment})+`));
        const trailingMatch = text.match(new RegExp(`(?:${legacyEdgeFragment})+$`));
        const leading = leadingMatch ? leadingMatch[0] : '';
        const trailing = trailingMatch ? trailingMatch[0] : '';
        const body = text.slice(leading.length, text.length - trailing.length);
        return {
            leading,
            trailing,
            body,
            hasMidMarker: body.includes(CONTROL_CODE_PLACEHOLDER),
        };
    }

    function normalizePrecacheRecord(record) {
        if (!record || typeof record !== 'object') return null;
        const raw = typeof record.raw === 'string' ? record.raw : '';
        const codedRaw = normalizeCacheKey(
            typeof record.codedRaw === 'string' && record.codedRaw.trim()
                ? record.codedRaw
                : createCodedRaw(raw || record.humanized || '')
        );
        if (!codedRaw) return null;

        const codedTranslation = typeof record.codedTranslation === 'string'
            ? record.codedTranslation
            : '';
        const legacyTranslation = typeof record.translation === 'string'
            ? record.translation
            : '';

        return {
            raw,
            codedRaw,
            codedTranslation,
            legacyTranslation,
            source: typeof record.source === 'string' ? record.source : '',
        };
    }

    function getRecordTranslation(record) {
        if (!record) return '';
        if (typeof record.codedTranslation === 'string' && record.codedTranslation.trim()) {
            return record.codedTranslation;
        }
        if (typeof record.legacyTranslation === 'string' && record.legacyTranslation.trim()) {
            return record.legacyTranslation;
        }
        return '';
    }

    function adaptPrecacheTranslationForInput(input, record) {
        const translation = getRecordTranslation(record);
        if (!translation.trim()) return null;

        if (record && record.stripTextBoundaries) {
            const inputParts = createBoundaryTextParts(input);
            const translationParts = createBoundaryTextParts(translation);
            if (inputParts && translationParts
                && countControlMarkers(translationParts.body) === countControlMarkers(inputParts.body)) {
                return inputParts.leading + translationParts.body + inputParts.trailing;
            }
        }

        if (countControlMarkers(translation) === countControlMarkers(input)) {
            return translation;
        }

        const inputEdge = splitEdgeControlMarkers(input);
        const rawEdge = splitEdgeControlMarkers(record && record.codedRaw);
        const translationEdge = splitEdgeControlMarkers(translation);
        if (inputEdge.hasMidMarker || rawEdge.hasMidMarker || translationEdge.hasMidMarker) {
            return null;
        }

        return inputEdge.leading + translationEdge.body + inputEdge.trailing;
    }

    function addPrecacheRecord(tables, record) {
        const normalized = normalizePrecacheRecord(record);
        if (!normalized) return false;

        const aliases = deriveCacheKeyAliases(normalized.codedRaw);
        addRawCodedAliases(aliases, normalized);
        for (const alias of aliases) {
            if (!tables.exact.has(alias)) {
                tables.exact.set(alias, { ...normalized, codedRaw: alias, match: 'codedRaw' });
            }

            const edge = splitEdgeControlMarkers(alias);
            if (!edge.hasMidMarker && edge.body && !tables.edge.has(edge.body)) {
                tables.edge.set(edge.body, { ...normalized, codedRaw: alias, match: 'codedRaw-edge' });
            }

            const boundaryTextKey = createBoundaryTextKey(alias);
            if (boundaryTextKey) {
                addUniqueFallbackAlias(tables.boundaryText, boundaryTextKey, {
                    ...normalized,
                    codedRaw: alias,
                    match: 'codedRaw-boundary-text',
                    stripTextBoundaries: true,
                });
            }
        }

        return true;
    }

    function buildPrecacheTables(records) {
        const tables = {
            exact: new Map(),
            edge: new Map(),
            boundaryText: new Map(),
            recordCount: 0,
            translatedRecordCount: 0,
        };

        for (const record of Array.isArray(records) ? records : []) {
            if (!addPrecacheRecord(tables, record)) continue;
            tables.recordCount += 1;
            const normalized = normalizePrecacheRecord(record);
            if (getRecordTranslation(normalized).trim()) {
                tables.translatedRecordCount += 1;
            }
        }

        return tables;
    }

    function createPrecacheStore(options = {}) {
        const {
            logger = {},
        } = options || {};
        const records = getLoadedPrecacheRecords();
        const tables = buildPrecacheTables(records);
        const sink = createPrecacheLogSink(logger);
        const active = tables.exact.size > 0;

        const writeLog = (payload) => {
            sink.write({
                ts: new Date().toISOString(),
                records: tables.recordCount,
                translatedRecords: tables.translatedRecordCount,
                ...payload,
            });
        };

        function findSingleSegment(input) {
            const exact = tables.exact.get(input);
            if (exact) {
                const translation = adaptPrecacheTranslationForInput(input, exact);
                if (translation) {
                    return { status: 'success', hit: { ...exact, translation } };
                }
                return {
                    status: 'fail',
                    reason: getRecordTranslation(exact).trim() ? 'marker-count-mismatch' : 'untranslated',
                    match: exact.match,
                    raw: exact.raw,
                    codedRaw: exact.codedRaw,
                    source: exact.source,
                };
            }

            const edgeInput = splitEdgeControlMarkers(input);
            if (!edgeInput.hasMidMarker && edgeInput.body) {
                const edge = tables.edge.get(edgeInput.body);
                if (edge) {
                    const translation = adaptPrecacheTranslationForInput(input, edge);
                    if (translation) {
                        return { status: 'success', hit: { ...edge, translation } };
                    }
                    return {
                        status: 'fail',
                        reason: getRecordTranslation(edge).trim() ? 'marker-count-mismatch' : 'untranslated',
                        match: edge.match,
                        raw: edge.raw,
                        codedRaw: edge.codedRaw,
                        source: edge.source,
                    };
                }
            }

            const boundaryInput = getBoundaryTextCandidates(input)
                .find((candidate) => tables.boundaryText.has(candidate));
            if (boundaryInput) {
                const boundary = tables.boundaryText.get(boundaryInput);
                const translation = adaptPrecacheTranslationForInput(input, boundary);
                if (translation) {
                    return { status: 'success', hit: { ...boundary, translation } };
                }
                return {
                    status: 'fail',
                    reason: getRecordTranslation(boundary).trim() ? 'marker-count-mismatch' : 'untranslated',
                    match: boundary.match,
                    raw: boundary.raw,
                    codedRaw: boundary.codedRaw,
                    source: boundary.source,
                };
            }

            return {
                status: 'fail',
                reason: 'miss',
            };
        }

        // Success logging is intentionally disabled so precache.log only contains failures.
        // function logSingleSuccess(input, hit) {
        //     writeLog({
        //         status: 'success',
        //         input,
        //         match: hit.match,
        //         raw: hit.raw,
        //         codedRaw: hit.codedRaw,
        //         source: hit.source,
        //         translation: hit.translation,
        //     });
        // }

        function logSingleFailure(input, miss) {
            writeLog({
                status: 'fail',
                input,
                reason: miss.reason,
                match: miss.match,
                raw: miss.raw,
                codedRaw: miss.codedRaw,
                source: miss.source,
            });
        }

        function splitLineSegments(input) {
            const value = String(input || '');
            if (!LINE_SEGMENT_SEPARATOR_PATTERN.test(value)) return null;
            LINE_SEGMENT_SEPARATOR_PATTERN.lastIndex = 0;
            return value.split(LINE_SEGMENT_SEPARATOR_PATTERN);
        }

        function lookupLineSegments(input) {
            const parts = splitLineSegments(input);
            if (!parts || parts.length < 3) return null;

            const outputParts = [];
            const segments = [];
            let segmentIndex = 0;

            for (const part of parts) {
                if (!part) continue;
                if (LINE_SEGMENT_SEPARATOR_PATTERN.test(part)) {
                    LINE_SEGMENT_SEPARATOR_PATTERN.lastIndex = 0;
                    outputParts.push(part);
                    continue;
                }
                LINE_SEGMENT_SEPARATOR_PATTERN.lastIndex = 0;

                if (!part.trim()) {
                    outputParts.push(part);
                    continue;
                }

                const leading = part.match(/^\s*/u)[0] || '';
                const trailing = part.match(/\s*$/u)[0] || '';
                const segmentInput = normalizeCacheKey(part);
                const result = findSingleSegment(segmentInput);
                segmentIndex += 1;

                if (result.status !== 'success') {
                    writeLog({
                        status: 'fail',
                        input,
                        reason: `segment-${result.reason}`,
                        segmentIndex,
                        segmentInput,
                        match: result.match,
                        raw: result.raw,
                        codedRaw: result.codedRaw,
                        source: result.source,
                        matchedSegments: segments,
                    });
                    return { failed: true };
                }

                const hit = result.hit;
                segments.push({
                    input: segmentInput,
                    match: hit.match,
                    raw: hit.raw,
                    codedRaw: hit.codedRaw,
                    source: hit.source,
                    translation: hit.translation,
                });
                outputParts.push(leading + hit.translation + trailing);
            }

            if (!segments.length) return null;

            const translation = outputParts.join('');
            const hit = {
                translation,
                raw: segments.map((segment) => segment.raw).filter(Boolean).join('\n'),
                codedRaw: segments.map((segment) => segment.codedRaw).filter(Boolean).join('\n'),
                source: segments.map((segment) => segment.source).filter(Boolean).join(','),
                match: 'codedRaw-line-segments',
                segments,
            };

            // Success logging is intentionally disabled so precache.log only contains failures.
            // writeLog({
            //     status: 'success',
            //     input,
            //     match: hit.match,
            //     segmentCount: segments.length,
            //     segments,
            //     translation,
            // });
            return hit;
        }

        function lookup(text) {
            const input = normalizeCacheKey(text);
            if (!active || !input) return null;

            const exact = findSingleSegment(input);
            if (exact.status === 'success') {
                // logSingleSuccess(input, exact.hit);
                return exact.hit;
            }

            const segmented = lookupLineSegments(input);
            if (segmented) {
                if (segmented.failed) return null;
                return segmented;
            }

            logSingleFailure(input, exact);
            return null;
        }

        return {
            active,
            lookup,
            getStats: () => ({
                records: tables.recordCount,
                translatedRecords: tables.translatedRecordCount,
                exactKeys: tables.exact.size,
                edgeKeys: tables.edge.size,
                boundaryTextKeys: Array.from(tables.boundaryText.values()).filter(Boolean).length,
            }),
        };
    }

    function createRateLimiter(options) {
        const dbg = typeof options?.dbg === 'function' ? options.dbg : noop;
        const state = {
            baseIntervalMs: 250,
            maxIntervalMs: 8000,
            intervalMs: 0,
            cooldownUntil: 0,
            lastRunAt: 0,
            queue: [],
            running: false,
        };

        function sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }

        function is429(err) {
            return err && (err.status === 429 || /\b429\b/.test(String(err && err.message)));
        }

        function parseRetryAfter(err) {
            try {
                const val = err && typeof err.retryAfter !== 'undefined' ? Number(err.retryAfter) : NaN;
                if (Number.isFinite(val) && val > 0) {
                    return Math.max(0, Math.floor(val * 1000));
                }
            } catch (_) {}
            return null;
        }

        function computeBackoffMs(err, backoffIndex) {
            const retryAfterMs = parseRetryAfter(err);
            if (retryAfterMs !== null) return Math.min(state.maxIntervalMs, retryAfterMs);
            const schedule = [1000, 2000, 4000, 8000];
            const idx = Math.min(backoffIndex, schedule.length - 1);
            return Math.min(state.maxIntervalMs, schedule[idx]);
        }

        async function processQueue() {
            if (state.running) return;
            state.running = true;
            try {
                while (state.queue.length) {
                    const { task, resolve, reject } = state.queue.shift();
                    let backoffIndex = 0;
                    let attempt = 0;
                    while (true) {
                        attempt += 1;
                        const now = Date.now();
                        const timeSinceLast = now - (state.lastRunAt || 0);
                        const waitForInterval = Math.max(0, state.intervalMs - timeSinceLast);
                        const waitForCooldown = Math.max(0, state.cooldownUntil - now);
                        const waitMs = Math.max(waitForInterval, waitForCooldown);
                        if (waitMs > 0) await sleep(waitMs);
                        try {
                            state.lastRunAt = Date.now();
                            const res = await task();
                            if (state.intervalMs === 0) state.intervalMs = state.baseIntervalMs;
                            else state.intervalMs = Math.max(state.baseIntervalMs, Math.floor(state.intervalMs * 0.75));
                            state.cooldownUntil = 0;
                            resolve(res);
                            break;
                        } catch (err) {
                            const backoffMs = computeBackoffMs(err, backoffIndex);
                            if (backoffIndex < 3) backoffIndex += 1;
                            const jitter = Math.floor(Math.random() * 250);
                            const totalWait = backoffMs + jitter;
                            state.intervalMs = Math.max(state.baseIntervalMs, backoffMs);
                            state.cooldownUntil = Date.now() + totalWait;
                            const tag = is429(err) ? '429' : 'retryable error';
                            dbg(`[Translate] ${tag} (attempt ${attempt}). Backing off ~${totalWait}ms`);
                            await sleep(totalWait);
                        }
                    }
                }
            } finally {
                state.running = false;
            }
        }

        function enqueue(task) {
            return new Promise((resolve, reject) => {
                state.queue.push({ task, resolve, reject });
                processQueue();
            });
        }

        return { enqueue };
    }

    function createTranslatorBatcher(options) {
        const {
            textProcessor = null,
            isLocalProvider = false,
            rateLimiter,
            logger = {},
            diag = noop,
        } = options || {};

        const logError = typeof logger.error === 'function' ? logger.error.bind(logger) : console.error;
        const translateText = textProcessor && typeof textProcessor.translateText === 'function'
            ? textProcessor.translateText.bind(textProcessor)
            : null;
        const translateMany = textProcessor && typeof textProcessor.translateMany === 'function'
            ? textProcessor.translateMany.bind(textProcessor)
            : null;

        const state = { queue: [], running: false };
        const MAX_BATCH_CHARS = 1800;
        const MAX_BATCH_ITEMS = 49;

        function takeNextBatch() {
            if (!state.queue.length) return null;
            let chars = 0;
            const items = [];
            while (state.queue.length) {
                const next = state.queue[0];
                const t = String(next.text);
                const len = t.length;
                if (items.length === 0) {
                    items.push(state.queue.shift());
                    chars += len;
                } else {
                    if (items.length >= MAX_BATCH_ITEMS) break;
                    if (chars + len > MAX_BATCH_CHARS) break;
                    items.push(state.queue.shift());
                    chars += len;
                }
            }
            return items;
        }

        async function run() {
            if (state.running) return;
            state.running = true;
            try {
                while (state.queue.length) {
                    const items = takeNextBatch();
                    if (!items || !items.length) break;
                    const texts = items.map((i) => String(i.text));
                    try {
                        if (isLocalProvider) {
                            if (!translateText) {
                                throw new Error('No translateText function available for local provider.');
                            }
                            for (const item of items) {
                                Promise.resolve()
                                    .then(() => translateText(String(item.text)))
                                    .then((res) => { try { item.resolve(typeof res === 'string' ? res : ''); } catch (_) {} })
                                    .catch((err) => { try { item.reject(err); } catch (_) {} });
                            }
                            continue;
                        }

                        if (!rateLimiter || typeof rateLimiter.enqueue !== 'function') {
                            throw new Error('Rate limiter unavailable for remote provider.');
                        }

                        const outputs = await rateLimiter.enqueue(() => {
                            if (translateMany) {
                                return translateMany(texts);
                            }
                            return Promise.all(texts.map((t) => translateText ? translateText(t) : Promise.resolve('')));
                        });

                        for (let i = 0; i < items.length; i++) {
                            const out = outputs && typeof outputs[i] === 'string' ? outputs[i] : '';
                            items[i].resolve(out);
                        }
                    } catch (err) {
                        diag('[TranslatorBatcher] remote failure; requeueing batch for retry');
                        // Push items back to the front of the queue for another attempt
                        state.queue = items.concat(state.queue);
                    }
                }
            } catch (err) {
                logError('[TranslatorBatcher] run error', err);
            } finally {
                state.running = false;
            }
        }

        function request(text) {
            return new Promise((resolve, reject) => {
                const wasIdle = state.queue.length === 0 && !state.running;
                state.queue.push({ text: String(text), resolve, reject });
                if (wasIdle) run();
            });
        }

        return { request };
    }

    function createTranslationCache(options) {
        const {
            logger = {},
            telemetry,
            diskCache = {},
            preview = defaultPreview,
            getCacheEntryLimit = () => 0,
            pruneMapToLimit = () => {},
            translatorBatcher,
            translateTextStream = null,
            isLocalProvider = false,
            isCacheOnlyProvider = false,
            precacheStore = null,
            diag = noop,
            settings = {},
        } = options || {};

        const logError = typeof logger.error === 'function' ? logger.error.bind(logger) : console.error;
        const telemetrySafe = ensureTelemetry(telemetry);
        const disk = diskCache && typeof diskCache === 'object' ? diskCache : { enabled: false };
        let translateSeq = 0;

        const cache = {
            completed: new Map(),
            ongoing: new Map(),
            requestTranslation,
            requestTranslationStream,
            shouldSkip,
            performTranslation,
            performTranslationStream,
            storeCompletedTranslation,
        };

        function shouldSkip(text) {
            if (!text) return true;
            const trimmed = String(text).trim();
            if (!trimmed) return true;
            const disableCjkFilter = !!(settings
                && settings.translation
                && settings.translation.disableCjkFilter);
            if (disableCjkFilter) return false;
            const hasKorean = /[\uAC00-\uD7AF]/u.test(trimmed);
            if (hasKorean) return true;
            const hasJapaneseOrChinese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/u.test(trimmed);
            return !hasJapaneseOrChinese;
        }

        function isAbortErrorLike(error) {
            if (!error) return false;
            if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return true;
            const message = typeof error.message === 'string' ? error.message : String(error);
            return /\bAbortError\b/i.test(message) || /\baborted\b/i.test(message);
        }

        function finalizeTranslationSuccess(normalized, translated) {
            try { cache.ongoing.delete(normalized); } catch (_) {}
            storeCompletedTranslation(normalized, translated);
            telemetrySafe.logTranslation('completed', normalized, translated);
            if (disk.enabled && typeof disk.appendRecord === 'function') {
                try { disk.appendRecord(normalized, translated); } catch (_) {}
            }
        }

        function storeCompletedTranslation(input, translated) {
            const aliases = deriveCacheKeyAliases(input);
            if (!aliases.length) return;
            const limit = getCacheEntryLimit();
            if (limit > 0) pruneMapToLimit(cache.completed, limit);
            aliases.forEach((alias) => {
                cache.completed.set(alias, translated);
            });
        }

        function finalizeTranslationFailure(normalized, error) {
            const message = error && error.message ? error.message : 'unknown error';
            telemetrySafe.logTranslation(isAbortErrorLike(error) ? 'aborted' : 'error', normalized, message);
            try { cache.ongoing.delete(normalized); } catch (_) {}
        }

        function resolvePrecacheShortcut(normalized) {
            if (!precacheStore || typeof precacheStore.lookup !== 'function') return null;
            const hit = precacheStore.lookup(normalized);
            if (!hit || typeof hit.translation !== 'string' || !hit.translation.trim()) return null;

            storeCompletedTranslation(normalized, hit.translation);
            telemetrySafe.logTranslation('precache_hit', normalized, hit.translation);
            return hit.translation;
        }

        function trackTranslationPromise(normalized, translationPromise) {
            cache.ongoing.set(normalized, translationPromise);
            translationPromise.then(
                (translated) => {
                    try {
                        finalizeTranslationSuccess(normalized, translated);
                    } catch (error) {
                        logError('[Translation Cache Finalize Error]', error);
                    }
                    return translated;
                },
                (error) => {
                    try {
                        finalizeTranslationFailure(normalized, error);
                    } catch (handlerError) {
                        logError('[Translation Cache Rejection Handler Error]', handlerError);
                    }
                }
            );
            return translationPromise;
        }

        function requestTranslation(text) {
            const normalized = normalizeCacheKey(text);
            telemetrySafe.logTranslation('request', normalized);

            const precached = resolvePrecacheShortcut(normalized);
            if (precached !== null) {
                return Promise.resolve(precached);
            }

            if (cache.completed.has(normalized)) {
                const existing = cache.completed.get(normalized);
                telemetrySafe.logTranslation('cache_hit', normalized, existing);
                return Promise.resolve(existing);
            }

            if (cache.ongoing.has(normalized)) {
                return cache.ongoing.get(normalized);
            }

            telemetrySafe.logTranslation('cache_miss', normalized);
            if (isCacheOnlyProvider) {
                telemetrySafe.logTranslation('skip', normalized, 'cache miss in none mode');
                return Promise.resolve(normalized);
            }
            const translationPromise = cache.performTranslation(normalized);
            return trackTranslationPromise(normalized, translationPromise);
        }

        function requestTranslationStream(text, options = {}) {
            const normalized = normalizeCacheKey(text);
            telemetrySafe.logTranslation('request', normalized);

            const precached = resolvePrecacheShortcut(normalized);
            if (precached !== null) {
                return Promise.resolve(precached);
            }

            if (cache.completed.has(normalized)) {
                const existing = cache.completed.get(normalized);
                telemetrySafe.logTranslation('cache_hit', normalized, existing);
                return Promise.resolve(existing);
            }

            if (cache.ongoing.has(normalized)) {
                return cache.ongoing.get(normalized);
            }

            telemetrySafe.logTranslation('cache_miss', normalized);
            if (isCacheOnlyProvider) {
                telemetrySafe.logTranslation('skip', normalized, 'cache miss in none mode');
                return Promise.resolve(normalized);
            }
            const translationPromise = cache.performTranslationStream(normalized, options);
            return trackTranslationPromise(normalized, translationPromise);
        }

        async function performTranslation(text) {
            const normalized = String(text);
            if (cache.shouldSkip(normalized)) {
                telemetrySafe.logTranslation('skip', normalized, 'trivial text (no letters/already translated)');
                return normalized;
            }

            if (!translatorBatcher || typeof translatorBatcher.request !== 'function') {
                const err = new Error('Translator unavailable');
                logError('[Translation] translator unavailable');
                throw err;
            }

            try {
                const id = (++translateSeq) & 0x7FFFFFFF;
                const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
                diag(`[Translate] #${id} Request | in="${preview(normalized)}"`);
                const result = await translatorBatcher.request(normalized);
                if (typeof result !== 'string' || !result.trim()) {
                    const emptyError = new Error('Translator returned no usable text.');
                    try { emptyError.code = 'EMPTY_TRANSLATION_OUTPUT'; } catch (_) {}
                    throw emptyError;
                }
                const end = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
                const timing = Math.round(end - start);
                diag(`[Translate] #${id} OK ${timing}ms | out="${preview(result)}"`);
                return result;
            } catch (err) {
                logError('[Translation Failure]', err);
                diag('[Translate] Failed');
                throw err;
            }
        }

        async function performTranslationStream(text, options = {}) {
            const normalized = String(text);
            if (cache.shouldSkip(normalized)) {
                telemetrySafe.logTranslation('skip', normalized, 'trivial text (no letters/already translated)');
                return normalized;
            }

            if (isLocalProvider && typeof translateTextStream === 'function') {
                const retryNonStreamTranslation = async (reason) => {
                    if (reason) {
                        logger.warn(`[Translate] ${reason} "${preview(normalized)}". Retrying with non-stream request.`);
                    }
                    try {
                        const fallbackResult = await performTranslation(normalized);
                        if (String(fallbackResult || '').trim() === normalized.trim()) {
                            logger.warn(`[Translate] Non-stream fallback also matched input for "${preview(normalized)}".`);
                        }
                        return fallbackResult;
                    } catch (fallbackErr) {
                        const fallbackMessage = fallbackErr && fallbackErr.message
                            ? fallbackErr.message
                            : String(fallbackErr);
                        logger.error(`[Translate] Non-stream fallback failed for "${preview(normalized)}": ${fallbackMessage}`);
                        throw fallbackErr;
                    }
                };
                const id = (++translateSeq) & 0x7FFFFFFF;
                const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
                diag(`[Translate] #${id} Stream | in="${preview(normalized)}"`);
                let result = '';
                try {
                    result = await translateTextStream(normalized, options);
                } catch (err) {
                    if (isAbortErrorLike(err)) throw err;
                    const message = err && err.message ? err.message : String(err);
                    return retryNonStreamTranslation(`Stream request failed (${message}) for`);
                }
                const end = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
                const timing = Math.round(end - start);
                diag(`[Translate] #${id} OK ${timing}ms | out="${preview(result)}"`);
                if (typeof result !== 'string' || !result.trim()) {
                    return retryNonStreamTranslation('Stream returned no usable text for');
                }
                if (result.trim() === normalized.trim()) {
                    return retryNonStreamTranslation('Stream output matched input for');
                }
                return result;
            }

            return performTranslation(normalized);
        }

        cache.shouldSkip = shouldSkip;
        cache.requestTranslation = requestTranslation;
        cache.requestTranslationStream = requestTranslationStream;
        cache.performTranslation = performTranslation;
        cache.performTranslationStream = performTranslationStream;

        return cache;
    }

    globalScope.LiveTranslatorModules.createTranslationManager = function createTranslationManager(options = {}) {
        const {
            logger,
            telemetry,
            diskCache,
            preview,
            getCacheEntryLimit,
            pruneMapToLimit,
            textProcessor,
            isLocalProvider = false,
            isCacheOnlyProvider = false,
            dbg,
            diag,
            settings = {},
        } = options;

        const rateLimiter = createRateLimiter({ dbg });
        const translatorBatcher = createTranslatorBatcher({
            textProcessor,
            isLocalProvider,
            rateLimiter,
            logger,
            diag,
        });
        const precacheStore = createPrecacheStore({ logger });
        try {
            if (precacheStore && precacheStore.active && typeof logger.info === 'function') {
                const stats = precacheStore.getStats();
                logger.info(`[Precache] Loaded ${stats.translatedRecords}/${stats.records} translated records (${stats.exactKeys} coded keys, ${stats.edgeKeys} edge keys).`);
            }
        } catch (_) {}

        const translationCache = createTranslationCache({
            logger,
            telemetry,
            diskCache,
            preview,
            getCacheEntryLimit,
            pruneMapToLimit,
            translatorBatcher,
            translateTextStream: textProcessor && typeof textProcessor.translateTextStream === 'function'
                ? textProcessor.translateTextStream.bind(textProcessor)
                : null,
            isLocalProvider,
            isCacheOnlyProvider,
            precacheStore,
            diag,
            settings,
        });

        return { translationCache };
    };
})();
