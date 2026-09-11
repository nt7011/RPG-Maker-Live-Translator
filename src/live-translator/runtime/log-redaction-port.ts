export interface LogRedactor {
    readonly text: (source: string) => string;
    readonly value: (source: unknown) => unknown;
    readonly record: <T>(source: T, protocol?: readonly string[]) => T;
}
function ownValue(source: unknown, key: string): unknown {
    if (typeof source !== 'object' || source === null)
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
export function captureLogRedactor(scope: unknown): LogRedactor | undefined {
    try {
        const candidate = ownValue(ownValue(scope, 'LiveTranslatorErrorGuard'), 'logRedactor');
        if (typeof ownValue(candidate, 'text') === 'function' &&
            typeof ownValue(candidate, 'value') === 'function' &&
            typeof ownValue(candidate, 'record') === 'function')
            return candidate as LogRedactor;
    }
    catch {
    }
    return undefined;
}
export function redactRecordSink<T>(sink: (record: T) => void, redactor: LogRedactor | undefined, protocol: readonly string[] = []): (record: T) => void {
    if (redactor === undefined)
        return sink;
    return (record) => {
        try {
            sink(redactor.record(record, protocol));
        }
        catch {
        }
    };
}
