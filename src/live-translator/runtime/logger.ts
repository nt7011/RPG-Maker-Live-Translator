import { createLoggerConfigurationCompiler } from './logger/configuration.js';
import { createLoggerLifecycle } from './logger/lifecycle.js';
import { createNoThrowLoggerSinks } from './logger/no-throw-sinks.js';
import { captureLogRedactor, type LogRedactor } from './log-redaction-port.js';
type PropertyBag = Record<PropertyKey, unknown>;
type StringFunction = (value?: unknown) => string;
function loggerNormalizeRecord(value: unknown): PropertyBag {
    return value !== null && (typeof value === 'object' || typeof value === 'function') ? (value as PropertyBag) : {};
}
function loggerString(stringify: StringFunction, value: unknown): string {
    return stringify(value);
}
function loggerLevelValue(levels: LogLevelsCandidate, level: string): unknown {
    return levels[level];
}
function loggerLessThanOrEqual(left: unknown, right: unknown): boolean {
    return (left as number) <= (right as number);
}
interface LogLevelsCandidate extends Record<string, number> {
    readonly debug: number;
    readonly error: number;
    readonly info: number;
    readonly trace: number;
    readonly warn: number;
}
interface LoggerBundleOptionsCandidate {
    readonly logLevels?: LogLevelsCandidate;
    readonly maxLogsPerFrame?: number;
    readonly monotonicNow?: unknown;
    readonly scheduleThrottleReset?: unknown;
    readonly settings?: unknown;
    readonly shouldBypassThrottle?: () => unknown;
}
export type LoggerPreview = (text: unknown, max?: number) => string;
export interface RuntimeLogger {
    emit(level: unknown, ...arguments_: unknown[]): void;
    error: (...arguments_: unknown[]) => void;
    warn: (...arguments_: unknown[]) => void;
    info: (...arguments_: unknown[]) => void;
    debug: (...arguments_: unknown[]) => void;
    trace: (...arguments_: unknown[]) => void;
    shouldLog(level: unknown): boolean;
    setLevel(level: unknown): void;
    getLevel(): string;
}
export interface LoggerBundle {
    readonly logger: RuntimeLogger;
    readonly dbg: (...arguments_: unknown[]) => void;
    readonly traceLog: (...arguments_: unknown[]) => void;
    readonly getFastTimestamp: () => string;
    readonly isLoggingEnabled: () => boolean;
    readonly preview: LoggerPreview;
}
export type CreateLoggerBundle = (options?: unknown) => LoggerBundle;
export function createLoggerModule(redactor: LogRedactor | undefined = captureLogRedactor(globalThis)): CreateLoggerBundle {
    const DEFAULT_LOG_LEVELS: LogLevelsCandidate = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        trace: 4,
    };
    const compileLoggerConfiguration = createLoggerConfigurationCompiler();
    function compileLogLevels(candidate: unknown): LogLevelsCandidate {
        const source = loggerNormalizeRecord(candidate);
        const compiled: Record<string, number> = {};
        let keys: PropertyKey[] = [];
        try {
            keys = Reflect.ownKeys(source);
        }
        catch {
        }
        for (const key of keys) {
            if (typeof key !== 'string')
                continue;
            try {
                const value = source[key];
                if (typeof value !== 'number' || !Number.isFinite(value))
                    continue;
                Object.defineProperty(compiled, key, {
                    value,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            }
            catch {
            }
        }
        for (const level of ['error', 'warn', 'info', 'debug', 'trace'] as const) {
            if (!Object.prototype.hasOwnProperty.call(compiled, level)) {
                compiled[level] = DEFAULT_LOG_LEVELS[level];
            }
        }
        return compiled as LogLevelsCandidate;
    }
    function defaultPreview(text: unknown, max = 48): string {
        const s = loggerString(String, text ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        if (s.length <= max)
            return s;
        return s.slice(0, Math.max(0, max - 1)) + '…';
    }
    function createLoggerBundle(options: unknown = {}): LoggerBundle {
        const normalizedOptions = loggerNormalizeRecord(options) as LoggerBundleOptionsCandidate & PropertyBag;
        const rawSettings = normalizedOptions.settings;
        const rawLogLevels = normalizedOptions.logLevels;
        const rawMaxLogsPerFrame = normalizedOptions.maxLogsPerFrame;
        const bypassCandidate = normalizedOptions.shouldBypassThrottle;
        const resetSchedulerCandidate = normalizedOptions.scheduleThrottleReset;
        const monotonicNowCandidate = normalizedOptions.monotonicNow;
        const configuration = compileLoggerConfiguration(rawSettings);
        const suppressionPolicy = configuration.suppression;
        const logLevels = compileLogLevels(rawLogLevels);
        const shouldBypassThrottle = typeof bypassCandidate === 'function' ? bypassCandidate : () => false;
        const lifecycle = createLoggerLifecycle({
            maxLogsPerFrame: rawMaxLogsPerFrame,
            monotonicNow: monotonicNowCandidate,
            scheduleThrottleReset: resetSchedulerCandidate,
        });
        const sinks = createNoThrowLoggerSinks(redactor);
        const getFastTimestamp = lifecycle.getFastTimestamp;
        function isLoggingEnabled(): boolean {
            return configuration.loggingEnabled;
        }
        let issueIndex = 0;
        while (issueIndex < suppressionPolicy.issues.length) {
            const issue = suppressionPolicy.issues[issueIndex];
            issueIndex += 1;
            if (issue === undefined)
                continue;
            sinks.warn([`[Logger] Invalid suppression configuration: ${issue}. Ordinary logging is suppressed.`]);
        }
        function shouldUseThrottleBypass(): boolean {
            try {
                return !!Reflect.apply(shouldBypassThrottle, undefined, []);
            }
            catch {
                return false;
            }
        }
        function forceLog(args: readonly unknown[]): void {
            if (!isLoggingEnabled())
                return;
            if (!lifecycle.admitOrdinaryLog(shouldUseThrottleBypass()))
                return;
            sinks.log(args);
        }
        function normalizeLevel(level: unknown): string {
            if (typeof level === 'string') {
                const lower = level.toLowerCase();
                if (Object.prototype.hasOwnProperty.call(logLevels, lower)) {
                    return lower;
                }
            }
            return 'info';
        }
        let currentLevel = normalizeLevel(configuration.initialLevel);
        function shouldLogNormalizedLevel(level: string): boolean {
            if (!isLoggingEnabled())
                return false;
            return loggerLessThanOrEqual(loggerLevelValue(logLevels, level), loggerLevelValue(logLevels, currentLevel));
        }
        function shouldLog(level: unknown): boolean {
            return shouldLogNormalizedLevel(normalizeLevel(level));
        }
        function emitArguments(level: unknown, args: readonly unknown[]): void {
            const normalizedLevel = normalizeLevel(level);
            if (!shouldLogNormalizedLevel(normalizedLevel))
                return;
            if (suppressionPolicy.shouldSuppress(args))
                return;
            switch (normalizedLevel) {
                case 'error':
                    sinks.error(args);
                    break;
                case 'warn':
                    sinks.warn(args);
                    break;
                default:
                    forceLog(args);
                    break;
            }
        }
        function emit(level: unknown, ...args: unknown[]): void {
            emitArguments(level, args);
        }
        function setLevel(level: unknown): void {
            currentLevel = normalizeLevel(level);
            emitArguments('info', [`[Logger] Level set to ${currentLevel}`]);
        }
        function getLevel(): string {
            return currentLevel;
        }
        const logger: RuntimeLogger = {
            emit,
            error: (...args: unknown[]) => {
                emitArguments('error', args);
            },
            warn: (...args: unknown[]) => {
                emitArguments('warn', args);
            },
            info: (...args: unknown[]) => {
                emitArguments('info', args);
            },
            debug: (...args: unknown[]) => {
                emitArguments('debug', args);
            },
            trace: (...args: unknown[]) => {
                emitArguments('trace', args);
            },
            shouldLog,
            setLevel,
            getLevel,
        };
        return {
            logger,
            dbg: (...args: unknown[]) => {
                logger.debug('[DBG]', ...args);
            },
            traceLog: (...args: unknown[]) => {
                logger.trace('[TRACE]', ...args);
            },
            getFastTimestamp,
            isLoggingEnabled,
            preview: defaultPreview,
        };
    }
    return createLoggerBundle;
}
