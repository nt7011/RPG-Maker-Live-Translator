// Log capture and progress-line parsing for the Precacher UI.
// The controller supplies state and render callbacks; this module owns only log behavior.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    function createLogController(context) {
        const {
            state,
            refs,
            intervalMs,
            renderStats,
            incrementTranslatedRecords,
            formatConsoleValue,
            parseDurationSeconds,
            parseFormattedInteger,
        } = context;

        function clearLogs() {
                state.logLines = [];
                renderLogs({ force: true });
            }
        
        function addLog(line) {
                const text = String(line || '').replace(/\s+$/u, '');
                if (!text) return;
        
                for (const part of text.split(/\r?\n/u)) {
                    if (!part.trim()) continue;
                    state.logLines.push(part);
                    parseLogLine(part);
                }
                state.logLines = state.logLines.slice(-20);
                renderLogs();
            }
        
        function renderLogs(options = {}) {
                if (!options.force && state.operation === 'translate') {
                    const now = Date.now();
                    const elapsed = now - state.lastLogRenderAt;
                    if (elapsed < intervalMs) {
                        if (!state.logRenderTimer) {
                            state.logRenderTimer = setTimeout(() => {
                                state.logRenderTimer = null;
                                renderLogs({ force: true });
                            }, intervalMs - elapsed);
                        }
                        return;
                    }
                }
        
                if (state.logRenderTimer) {
                    clearTimeout(state.logRenderTimer);
                    state.logRenderTimer = null;
                }
                state.lastLogRenderAt = Date.now();
                refs.logs.textContent = state.logLines.length ? state.logLines.join('\n') : 'No logs yet.';
                refs.logs.scrollTop = refs.logs.scrollHeight;
            }
        
        function parseLogLine(line) {
                const benchmark = line.match(/Benchmark: .*?\|\s+(\d+)\s+batch\(es\) saved \| active (\d+) \| queue (\d+) \| failed (\d+)/i);
                if (benchmark) {
                    state.metrics.completedBatches = Number(benchmark[1]) || 0;
                    state.metrics.activeWorkers = Number(benchmark[2]) || 0;
                    state.metrics.queueLength = Number(benchmark[3]) || 0;
                    state.metrics.failed = Number(benchmark[4]) || 0;
                    const tokens = line.match(/Benchmark:\s+([\d,]+)\/([\d,]+)\s+est source tokens/i);
                    if (tokens) {
                        state.metrics.successfulTokens = parseFormattedInteger(tokens[1]);
                        state.metrics.totalTokens = parseFormattedInteger(tokens[2]);
                    }
                    const rate = line.match(/\|\s+([0-9.]+)\s+tok\/s\b/i);
                    if (rate) state.metrics.tokensPerSecond = Number(rate[1]) || 0;
                    const eta = line.match(/\|\s+ETA\s+([^|]+?)\s+\|/i);
                    if (eta) state.metrics.etaSeconds = parseDurationSeconds(eta[1]);
                    renderStats();
                    return;
                }
        
                const saved = line.match(/saved batch [^(]+ \((\d+) text\(s\), (\d+) record\(s\)\)/i);
                if (saved) {
                    state.metrics.completedBatches += 1;
                    incrementTranslatedRecords(saved[2]);
                    renderStats();
                    return;
                }
        
                if (/failed id \d+:/i.test(line)) {
                    state.metrics.failed += 1;
                    renderStats();
                }
            }
        
        function captureConsoleDuring(task) {
                const originalLog = console.log;
                const originalWarn = console.warn;
                const originalError = console.error;
                const capture = (args) => {
                    const line = args.map(formatConsoleValue).join(' ');
                    if (/^\[(Precacher|PrecacheTranslator|PrecacheUI)\]/.test(line)) {
                        addLog(line);
                    }
                };
        
                console.log = (...args) => {
                    capture(args);
                    originalLog.apply(console, args);
                };
                console.warn = (...args) => {
                    capture(args);
                    originalWarn.apply(console, args);
                };
                console.error = (...args) => {
                    capture(args);
                    originalError.apply(console, args);
                };
        
                return Promise.resolve()
                    .then(task)
                    .finally(() => {
                        console.log = originalLog;
                        console.warn = originalWarn;
                        console.error = originalError;
                    });
            }

        return {
            addLog,
            captureConsoleDuring,
            clearLogs,
            renderLogs,
        };
    }

    globalScope.PrecacheUiLogs = Object.freeze({ createLogController });
})();
