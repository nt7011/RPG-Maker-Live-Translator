import type { TelemetryDiagnosticsPortModule } from './telemetry-diagnostics-port.js';
type PropertyBag = Record<PropertyKey, unknown>;
export type RuntimePreview = (text: unknown, maximum?: number) => string;
export interface LoggerBundle {
    readonly logger: unknown;
    readonly dbg: unknown;
    readonly traceLog: unknown;
    readonly getFastTimestamp: unknown;
    readonly isLoggingEnabled: unknown;
    readonly preview?: unknown;
}
export interface LoggerBundleFactoryOptions {
    readonly settings?: unknown;
    readonly paths?: unknown;
    readonly maxLogsPerFrame?: number;
    readonly shouldBypassThrottle?: () => boolean;
}
export type LoggerBundleFactory = (options?: LoggerBundleFactoryOptions) => unknown;
export interface LoggerContext {
    readonly loggingBundle: LoggerBundle;
    readonly logger: unknown;
    readonly dbg: unknown;
    readonly traceLog: unknown;
    readonly getFastTimestamp: unknown;
    readonly isLoggingEnabled: unknown;
    readonly preview: RuntimePreview;
    readonly telemetry: unknown;
}
export interface LoggerContextModule {
    readonly createLoggerContext: (options?: unknown) => LoggerContext;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRecordObject(value: unknown): value is PropertyBag {
    return typeof value === 'object' && value !== null;
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function truthyOr<Value, Fallback>(value: Value, fallback: () => Fallback): Value | Fallback {
    if (value)
        return value;
    return fallback();
}
function stringValue(value: unknown): string {
    const converted: unknown = Reflect.apply(String, undefined, [value]);
    if (typeof converted !== 'string')
        throw new TypeError('String conversion did not return text.');
    return converted;
}
function numberValue(value: unknown): number {
    const converted: unknown = Reflect.apply(Number, undefined, [value]);
    if (typeof converted !== 'number')
        throw new TypeError('Number conversion did not return a number.');
    return converted;
}
function isLoggerBundle(value: unknown): value is LoggerBundle {
    return isPropertyBag(value) && isPropertyBag(value['logger']);
}
function isRuntimePreview(value: unknown): value is RuntimePreview {
    return typeof value === 'function';
}
function createPreview(loggerPreview: unknown): RuntimePreview {
    if (isRuntimePreview(loggerPreview))
        return loggerPreview;
    return (text: unknown, maximum = 48): string => {
        const normalized = stringValue(text ?? '')
            .replace(/\s+/gu, ' ')
            .trim();
        if (normalized.length <= maximum)
            return normalized;
        return normalized.slice(0, Math.max(0, numberValue(maximum) - 1)) + '...';
    };
}
export function createLoggerContextModule(createLoggerBundle: LoggerBundleFactory, telemetryDiagnosticsModule: TelemetryDiagnosticsPortModule, runtimeScope: unknown): LoggerContextModule {
    function createLoggerContext(options: unknown = {}): LoggerContext {
        const values = isRecordObject(options) ? options : {};
        const settings = truthyOr(propertyValue(values, 'settings'), () => ({}));
        const scopePaths = propertyValue(runtimeScope, 'LiveTranslatorPaths');
        const paths = truthyOr(propertyValue(values, 'paths'), () => truthyOr(scopePaths, () => ({})));
        const loggingBundleValue = Reflect.apply(createLoggerBundle, undefined, [
            {
                settings,
                paths,
                maxLogsPerFrame: 1000,
                shouldBypassThrottle: (): boolean => propertyValue(values, 'isLocalProvider') === true,
            },
        ]);
        if (!isLoggerBundle(loggingBundleValue)) {
            throw new Error('[LiveTranslator] runtime.logger did not create a valid logger bundle.');
        }
        const preview = createPreview(loggingBundleValue.preview);
        const telemetry = telemetryDiagnosticsModule.createTelemetryDiagnostics({
            logger: loggingBundleValue.logger,
        });
        const context: LoggerContext = {
            loggingBundle: loggingBundleValue,
            logger: loggingBundleValue.logger,
            dbg: loggingBundleValue.dbg,
            traceLog: loggingBundleValue.traceLog,
            getFastTimestamp: loggingBundleValue.getFastTimestamp,
            isLoggingEnabled: loggingBundleValue.isLoggingEnabled,
            preview,
            telemetry,
        };
        const runtimeWindow = truthyOr(propertyValue(runtimeScope, 'window'), () => null);
        if (isPropertyBag(runtimeWindow))
            runtimeWindow['translationLogger'] = context.logger;
        return context;
    }
    return { createLoggerContext };
}
