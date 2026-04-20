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
            diag,
            settings,
        });

        return { translationCache };
    };
})();
