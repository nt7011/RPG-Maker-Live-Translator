(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }

    const DIAGNOSTICS_FILE = 'diagnostics.log';
    const MAX_DIAG_BYTES = 128 * 1024 * 1024;
    const diagnosticsSink = (() => {
        try {
            const req = (typeof require === 'function')
                ? require
                : (typeof window !== 'undefined' && typeof window.require === 'function' ? window.require : null);
            if (!req || typeof process === 'undefined') return { write: () => {} };
            const fs = req('fs');
            const path = req('path');
            const cwd = typeof process.cwd === 'function' ? process.cwd() : null;
            if (!cwd || typeof cwd !== 'string') return { write: () => {} };
            const full = path.join(cwd, DIAGNOSTICS_FILE);
            const ensureSize = async () => {
                if (!fs || !fs.promises || typeof fs.promises.stat !== 'function') return;
                try {
                    const stat = await fs.promises.stat(full);
                    if (stat && stat.size > MAX_DIAG_BYTES) {
                        const data = await fs.promises.readFile(full, 'utf8');
                        if (data && data.length) {
                            const slice = data.slice(Math.max(0, data.length - MAX_DIAG_BYTES / 2));
                            await fs.promises.writeFile(full, slice, 'utf8');
                        }
                    }
                } catch (_) {}
            };
            const append = (line) => {
                try {
                    if (fs && fs.promises && typeof fs.promises.appendFile === 'function') {
                        fs.promises.appendFile(full, line, 'utf8')
                            .then(() => ensureSize())
                            .catch(() => {});
                    } else if (fs && typeof fs.appendFile === 'function') {
                        fs.appendFile(full, line, 'utf8', () => {});
                    }
                } catch (_) {}
            };
            return {
                write: (level, parts) => {
                    try {
                        const line = `${new Date().toISOString()} | ${level} | ${parts.join(' ')}\n`;
                        append(line);
                    } catch (_) {}
                }
            };
        } catch (_) {
            return { write: () => {} };
        }
    })();
    const DEFAULT_LOG_LEVELS = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        trace: 4,
    };

    function defaultPreview(text, max = 48) {
        const s = String(text ?? '').replace(/\s+/g, ' ').trim();
        if (s.length <= max) return s;
        return s.slice(0, Math.max(0, max - 1)) + '…';
    }

    function bindConsoleMethod(consoleRef, method, fallback) {
        if (!consoleRef) return fallback;
        const fn = consoleRef[method];
        if (typeof fn === 'function') {
            try {
                return fn.bind(consoleRef);
            } catch (_) {
                return (...args) => fn.apply(consoleRef, args);
            }
        }
        return fallback;
    }

    function normalizeSuppressionEntries(list) {
        if (!Array.isArray(list)) return [];
        return list.map((entry) => {
            if (entry && typeof entry === 'object' && !(entry instanceof RegExp)) {
                const clone = { ...entry };
                if (typeof clone.regex === 'string') {
                    try {
                        clone.regex = new RegExp(clone.regex);
                    } catch (_) {
                        clone.regex = null;
                    }
                }
                return clone;
            }
            if (typeof entry === 'string' || entry instanceof RegExp) {
                return entry;
            }
            return entry;
        });
    }

    function normalizeSettings(settings) {
        if (!settings || typeof settings !== 'object') return {};
        const clone = { ...settings };
        if (clone.logging && typeof clone.logging === 'object') {
            const loggingClone = { ...clone.logging };
            loggingClone.suppressExact = normalizeSuppressionEntries(loggingClone.suppressExact);
            clone.logging = loggingClone;
        }
        return clone;
    }

    globalScope.LiveTranslatorModules.createLoggerBundle = function createLoggerBundle(options = {}) {
        const {
            settings: rawSettings = {},
            logLevels = DEFAULT_LOG_LEVELS,
            maxLogsPerFrame = 1000,
            shouldBypassThrottle = () => false,
        } = options;

        const settings = normalizeSettings(rawSettings);
        const loggingSettings = settings.logging && typeof settings.logging === 'object'
            ? settings.logging
            : null;
        const compiledSuppressExact = loggingSettings && Array.isArray(loggingSettings.suppressExact)
            ? loggingSettings.suppressExact
            : [];

        const consoleRef = typeof console !== 'undefined' ? console : {};
        const originalConsoleLog = bindConsoleMethod(consoleRef, 'log', () => {});
        const originalConsoleWarn = bindConsoleMethod(consoleRef, 'warn', originalConsoleLog);
        const originalConsoleError = bindConsoleMethod(consoleRef, 'error', originalConsoleWarn);

        function isLoggingEnabled() {
            if (loggingSettings && Object.prototype.hasOwnProperty.call(loggingSettings, 'enabled')) {
                return !!loggingSettings.enabled;
            }
            return true;
        }

        let logThrottle = 0;
        const scheduleReset = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (cb) => setTimeout(cb, 16);

        function forceLog(...args) {
            if (!isLoggingEnabled()) return;
            if (shouldBypassThrottle()) {
                try {
                    originalConsoleLog(...args);
                    return;
                } catch (_) {}
            }
            if (logThrottle === 0) {
                try {
                    scheduleReset(() => { logThrottle = 0; });
                } catch (_) {
                    setTimeout(() => { logThrottle = 0; }, 16);
                }
            }
            if (logThrottle >= maxLogsPerFrame) return;
            logThrottle++;
            try {
                originalConsoleLog(...args);
            } catch (_) {
                try {
                    if (typeof window !== 'undefined' && window.alert) {
                        window.alert(args.join(' '));
                    }
                } catch (_) {}
            }
        }

        let fastTimestamp = '';
        let lastTimestampUpdate = 0;
        function getFastTimestamp() {
            const now = Date.now();
            if (now - lastTimestampUpdate > 1000) {
                try {
                    fastTimestamp = new Date().toISOString().split('T')[1].substring(0, 8);
                } catch (_) {
                    fastTimestamp = '00:00:00';
                }
                lastTimestampUpdate = now;
            }
            return fastTimestamp;
        }

        function normalizeLevel(level) {
            if (typeof level === 'string') {
                const lower = level.toLowerCase();
                if (Object.prototype.hasOwnProperty.call(logLevels, lower)) {
                    return lower;
                }
            }
            return 'info';
        }

        function shouldSuppress(level, args) {
            try {
                if (!compiledSuppressExact.length) return false;
                const rendered = args.map((arg) => {
                    if (typeof arg === 'string') return arg;
                    try { return JSON.stringify(arg); } catch (_) { return String(arg); }
                }).join(' ');
                return compiledSuppressExact.some((entry) => {
                    if (typeof entry === 'string') {
                        return entry === rendered;
                    }
                    if (entry instanceof RegExp) {
                        entry.lastIndex = 0;
                        return entry.test(rendered);
                    }
                    if (entry && typeof entry === 'object') {
                        const { equals, regex } = entry;
                        if (typeof equals === 'string' && equals === rendered) return true;
                        if (regex instanceof RegExp) {
                            regex.lastIndex = 0;
                            return regex.test(rendered);
                        }
                    }
                    return false;
                });
            } catch (_) {
                return false;
            }
        }

        let currentLevel = normalizeLevel(settings.debug && settings.debug.level);

        function shouldLog(level) {
            if (!isLoggingEnabled()) return false;
            const lvl = normalizeLevel(level);
            return logLevels[lvl] <= logLevels[currentLevel];
        }

        function emit(level, ...args) {
            if (!shouldLog(level)) return;
            if (shouldSuppress(level, args)) return;
            if (level === 'warn' || level === 'error') {
                try { diagnosticsSink.write(level.toUpperCase(), args.map((a) => String(a))); } catch (_) {}
            }
            switch (normalizeLevel(level)) {
                case 'error':
                    originalConsoleError(...args);
                    break;
                case 'warn':
                    originalConsoleWarn(...args);
                    break;
                default:
                    forceLog(...args);
                    break;
            }
        }

        function setLevel(level) {
            currentLevel = normalizeLevel(level);
            if (settings && settings.debug) {
                settings.debug.level = currentLevel;
            }
            emit('info', `[Logger] Level set to ${currentLevel}`);
        }

        function getLevel() {
            return currentLevel;
        }

        const logger = {
            emit,
            error: (...args) => emit('error', ...args),
            warn: (...args) => emit('warn', ...args),
            info: (...args) => emit('info', ...args),
            debug: (...args) => emit('debug', ...args),
            trace: (...args) => emit('trace', ...args),
            shouldLog,
            setLevel,
            getLevel,
        };

        return {
            logger,
            dbg: (...args) => logger.debug('[DBG]', ...args),
            diag: (...args) => logger.trace('[DIAG]', ...args),
            getFastTimestamp,
            isLoggingEnabled,
            preview: defaultPreview,
            createTelemetryChannel: (options = {}) => createTelemetryChannel({
                logger,
                getFastTimestamp,
                preview: options.preview || defaultPreview,
            }),
        };
    };

    function createTelemetryChannel(options = {}) {
        const {
            logger,
            getFastTimestamp = () => '',
            preview = defaultPreview,
        } = options;

        if (!logger || typeof logger.trace !== 'function') {
            throw new Error('[Logger] telemetry channel requires an active logger');
        }

        function logTextDetected(source, text, x, y, extraInfo = {}) {
            if (!logger.shouldLog || !logger.shouldLog('trace')) return;
            const timestamp = getFastTimestamp();
            logger.trace(`[DETECT|${timestamp}] ${source} at (${x},${y}): "${preview(text)}"${extraInfo.windowType ? ` [${extraInfo.windowType}]` : ''}`);
            if (extraInfo.converted && extraInfo.converted !== text) {
                logger.trace(`  └─ Converted: "${preview(extraInfo.converted)}"`);
            }
        }

        function logTranslation(event, text, result = null, timing = null) {
            const timestamp = getFastTimestamp();
            switch (event) {
                case 'request':
                    if (logger.shouldLog && logger.shouldLog('debug')) {
                        logger.debug(`[TRANSLATE|${timestamp}] REQUEST: "${preview(text)}"`);
                    }
                    break;
                case 'cache_hit':
                    if (logger.shouldLog && logger.shouldLog('debug')) {
                        logger.debug(`[TRANSLATE|${timestamp}] CACHE HIT: "${preview(text)}" → "${preview(result)}"`);
                    }
                    break;
                case 'cache_miss':
                    if (logger.shouldLog && logger.shouldLog('debug')) {
                        logger.debug(`[TRANSLATE|${timestamp}] CACHE MISS: "${preview(text)}" (starting translation...)`);
                    }
                    break;
                case 'completed':
                    if (logger.shouldLog && logger.shouldLog('debug')) {
                        const timeStr = timing ? ` (${timing}ms)` : '';
                        logger.debug(`[TRANSLATE|${timestamp}] COMPLETED${timeStr}: "${preview(text)}" → "${preview(result)}"`);
                    }
                    break;
                case 'error':
                    logger.warn(`[TRANSLATE|${timestamp}] ERROR: "${preview(text)}" - ${result}`);
                    break;
                case 'skip':
                    if (logger.shouldLog && logger.shouldLog('debug')) {
                        logger.debug(`[TRANSLATE|${timestamp}] SKIP: "${preview(text)}" - ${result}`);
                    }
                    break;
                default:
                    break;
            }
        }

        function logDraw(event, text, x, y, extraInfo = {}) {
            if (!logger.shouldLog || !logger.shouldLog('trace')) return;
            const timestamp = getFastTimestamp();
            switch (event) {
                case 'original':
                    logger.trace(`[DRAW|${timestamp}] ORIGINAL at (${x},${y}): "${preview(text)}"`);
                    break;
                case 'redraw':
                    // Stubbed because this redraw telemetry was spamming the log during signature redraws.
                    // logger.trace(`[DRAW|${timestamp}] REDRAW at (${x},${y}): "${preview(text)}" [${extraInfo.windowType || 'unknown'}]`);
                    // if (extraInfo.clearArea) {
                    //     logger.trace(`  └─ Clear: (${extraInfo.clearArea.x},${extraInfo.clearArea.y}) ${extraInfo.clearArea.w}×${extraInfo.clearArea.h}`);
                    // }
                    break;
                case 'bypass':
                    // Stubbed because this signature bypass telemetry was spamming the log.
                    // logger.trace(`[DRAW|${timestamp}] BYPASS at (${x},${y}): "${preview(text)}" (signature detected)`);
                    break;
                case 'queue':
                    logger.trace(`[DRAW|${timestamp}] QUEUED at (${x},${y}): "${preview(text)}" (window not ready)`);
                    break;
                case 'skip_same':
                    logger.trace(`[DRAW|${timestamp}] SKIP at (${x},${y}): "${preview(text)}" (identical to original)`);
                    break;
                default:
                    break;
            }
        }

        return {
            logTextDetected,
            logTranslation,
            logDraw,
            showStats: () => {},
        };
    }
})();
