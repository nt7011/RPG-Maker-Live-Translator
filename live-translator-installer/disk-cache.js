(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }

    function ensureLogger(logger) {
        if (logger && typeof logger.error === 'function' && typeof logger.warn === 'function') {
            return logger;
        }
        return {
            error: (...args) => { try { console.error(...args); } catch (_) {} },
            warn: (...args) => { try { console.warn(...args); } catch (_) {} },
        };
    }

    function resolveCacheDir() {
        try {
            if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                const cwd = process.cwd();
                if (cwd && typeof cwd === 'string') {
                    return cwd;
                }
            }
        } catch (_) {}
        return null;
    }

    function normalizeSettings(settings) {
        if (!settings || typeof settings !== 'object') return {};
        if (settings.diskCache && typeof settings.diskCache === 'object') return settings.diskCache;
        return settings;
    }

    function byteLength(str) {
        const value = String(str ?? '');
        if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
            return Buffer.byteLength(value, 'utf8');
        }
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(value).length;
        }
        let sum = 0;
        for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i);
            sum += code <= 0x7F ? 1 : (code <= 0x7FF ? 2 : 3);
        }
        return sum;
    }

    function parseRecord(line) {
        if (!line) return null;
        try {
            const obj = JSON.parse(line);
            if (obj && typeof obj.in === 'string' && typeof obj.out === 'string') {
                return obj;
            }
        } catch (_) {}
        return null;
    }

    globalScope.LiveTranslatorModules.createDiskCache = function createDiskCache(options = {}) {
        const {
            logger,
            settings = {},
            defaultCacheMegabytes = 32,
        } = options;

        const log = ensureLogger(logger);
        let fs = null;
        let path = null;

        try {
            if (typeof require === 'function') {
                fs = require('fs');
                path = require('path');
            }
        } catch (_) {}

        const cacheSettings = normalizeSettings(settings);
        const normalizedSettings = {
            enabled: cacheSettings.enabled !== false,
            maxMegabytes: (() => {
                const configured = Number(cacheSettings.maxMegabytes);
                if (Number.isFinite(configured) && configured > 0) {
                    return configured;
                }
                if (Number.isFinite(defaultCacheMegabytes) && defaultCacheMegabytes > 0) {
                    return defaultCacheMegabytes;
                }
                return 32;
            })(),
            clearOnLaunch: !!cacheSettings.clearOnLaunch,
        };
        const dir = (fs && path) ? resolveCacheDir() : null;
        const disabledReason = (() => {
            if (!fs || !path) return 'fs/path modules unavailable';
            if (!dir || typeof dir !== 'string') return 'cache directory could not be resolved';
            if (!normalizedSettings.enabled) return 'disabled via settings';
            return null;
        })();
        if (disabledReason) {
            if (typeof log.info === 'function') {
                log.info('[DiskCache] Disabled:', disabledReason);
            } else {
                log.error('[DiskCache] Disabled:', disabledReason);
            }
        }
        const enabled = !disabledReason;
        const file = enabled ? path.join(dir, 'translation-cache.log') : null;

        const maxMegabytes = normalizedSettings.maxMegabytes;
        const maxBytes = maxMegabytes === Infinity ? Infinity : maxMegabytes * 1024 * 1024;

        const records = [];
        let totalBytes = 0;
        let hydrated = false;
        let launchPrepared = false;
        let chain = Promise.resolve();

        const makeRecord = (input, output) => {
            const payload = JSON.stringify({ in: String(input), out: String(output) }) + '\n';
            return { serialized: payload, size: byteLength(payload) };
        };

        const ensureDir = async () => {
            if (!enabled) return;
            await fs.promises.mkdir(dir, { recursive: true });
        };

        const rewriteAll = async () => {
            await ensureDir();
            const payload = records.map((r) => r.serialized).join('');
            await fs.promises.writeFile(file, payload, 'utf8');
        };

        const appendLine = async (line) => {
            await ensureDir();
            await fs.promises.appendFile(file, line, 'utf8');
        };

        const trimToLimit = () => {
            if (!maxBytes || maxBytes === Infinity) return false;
            let trimmed = false;
            while (totalBytes > maxBytes && records.length) {
                const dropped = records.shift();
                if (!dropped) break;
                totalBytes = Math.max(0, totalBytes - dropped.size);
                trimmed = true;
            }
            return trimmed;
        };

        const readFromDisk = async () => {
            records.length = 0;
            totalBytes = 0;
            let data = '';
            try {
                data = await fs.promises.readFile(file, 'utf8');
            } catch (err) {
                if (err && err.code !== 'ENOENT') {
                    throw err;
                }
                return;
            }
            const lines = data.split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
                const parsed = parseRecord(line);
                if (!parsed) continue;
                const rec = makeRecord(parsed.in, parsed.out);
                records.push(rec);
                totalBytes += rec.size;
            }
            if (trimToLimit()) {
                await rewriteAll();
            }
        };

        const ensureHydrated = async () => {
            if (!enabled || hydrated) return;
            hydrated = true;
            await readFromDisk();
        };

        const clearLog = async () => {
            if (!enabled) return;
            hydrated = true;
            records.length = 0;
            totalBytes = 0;
            try {
                await fs.promises.rm(file, { force: true });
            } catch (err) {
                try { await fs.promises.unlink(file); } catch (_) {}
            }
        };

        const shouldClearOnLaunch = normalizedSettings.clearOnLaunch;

        const prepareOnLaunch = async () => {
            if (!enabled || launchPrepared) return;
            launchPrepared = true;
            if (shouldClearOnLaunch) {
                await clearLog();
                return;
            }
            await ensureHydrated();
        };

        const enqueue = (work) => {
            chain = chain.then(work).catch((err) => {
                log.error('[DiskCache Error]', err);
            });
            return chain;
        };

        const appendRecord = async (input, output) => {
            if (!enabled) return;
            const record = makeRecord(input, output);
            return enqueue(async () => {
                await prepareOnLaunch();
                await ensureHydrated();
                records.push(record);
                totalBytes += record.size;
                if (trimToLimit()) {
                    await rewriteAll();
                } else {
                    await appendLine(record.serialized);
                }
            });
        };

        const loadAll = async () => {
            if (!enabled) return [];
            await prepareOnLaunch();
            await ensureHydrated();
            return records.map((rec) => {
                try {
                    return JSON.parse(rec.serialized);
                } catch (_) {
                    return null;
                }
            }).filter(Boolean);
        };

        return {
            enabled,
            appendRecord,
            loadAll,
            ensureLaunchPrune: prepareOnLaunch,
            getMaxMegabytes: () => maxMegabytes,
        };
    };
})();
