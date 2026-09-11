type RuntimeFunction = (...args: never[]) => unknown;
type PropertyBag = Record<PropertyKey, unknown>;
const MIN_NW_VERSION = '0.100.1';
const RECOMMENDED_NW_VERSION = '0.105.0';
const RELEASE_SYNTAX_TARGET = 'ES2024';
const RUNTIME_LOADER_FILE = 'live-translator-runtime-loader.js';
interface RuntimeLoaderFailureState {
    readonly status: 'failed';
    readonly startedAt: number;
    readonly failedAt: number;
    readonly error: string;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRuntimeFunction(value: unknown): value is RuntimeFunction {
    return typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function truthyOr(value: unknown, fallback: unknown): unknown {
    if (value)
        return value;
    return fallback;
}
function stringValue(value: unknown): string {
    if (value === undefined || value === null)
        return '';
    try {
        const converted: unknown = Reflect.apply(String, undefined, [value]);
        return typeof converted === 'string' ? converted : '';
    }
    catch {
        return '';
    }
}
function getScope(): PropertyBag | null {
    const globalValue: unknown = typeof window !== 'undefined' ? window : globalThis;
    return isPropertyBag(globalValue) ? globalValue : null;
}
function getProcessRef(scope: PropertyBag | null): unknown {
    const scopedProcess = propertyValue(scope, 'process');
    if (scopedProcess)
        return scopedProcess;
    return truthyOr(propertyValue(globalThis, 'process'), null);
}
function detectNwVersion(scope: PropertyBag | null): string {
    const processRef = getProcessRef(scope);
    const versions = propertyValue(processRef, 'versions');
    const nwVersion = propertyValue(versions, 'nw');
    return nwVersion ? stringValue(nwVersion) : '';
}
function parseVersionParts(version: unknown): number[] {
    const rawParts = stringValue(truthyOr(version, '')).split('.');
    const parts: number[] = [];
    for (const rawPart of rawParts) {
        const value = Number.parseInt(rawPart, 10);
        parts.push(Number.isNaN(value) ? 0 : value);
    }
    return parts;
}
function compareVersions(left: unknown, right: unknown): -1 | 0 | 1 {
    const leftParts = parseVersionParts(left);
    const rightParts = parseVersionParts(right);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const leftValue = leftParts[index] ?? 0;
        const rightValue = rightParts[index] ?? 0;
        if (leftValue > rightValue)
            return 1;
        if (leftValue < rightValue)
            return -1;
    }
    return 0;
}
function shouldWarnNwVersion(version: string): boolean {
    return Boolean(version) && compareVersions(version, RECOMMENDED_NW_VERSION) < 0;
}
function projectLogArguments(scope: PropertyBag | null, args: unknown[]): unknown[] {
    const redactor = propertyValue(propertyValue(scope, 'LiveTranslatorErrorGuard'), 'logRedactor');
    const project = propertyValue(redactor, 'value');
    return isRuntimeFunction(project) ? (Reflect.apply(project, redactor, [args]) as unknown[]) : args;
}
function consoleWarning(scope: PropertyBag | null, message: string): void {
    try {
        const sink = propertyValue(scope, 'console');
        const warn = propertyValue(sink, 'warn');
        if (isRuntimeFunction(warn))
            Reflect.apply(warn, sink, projectLogArguments(scope, [message]));
    }
    catch {
    }
}
function publishRuntimeLoaderFailure(scope: PropertyBag | null, startedAt: number, error: Error): void {
    const failure: RuntimeLoaderFailureState = Object.freeze({
        status: 'failed',
        startedAt,
        failedAt: Date.now(),
        error: error.message,
    });
    try {
        if (scope)
            scope['LiveTranslatorLoaderState'] = failure;
    }
    catch {
    }
    try {
        const sink = propertyValue(scope, 'console');
        const report = propertyValue(sink, 'error');
        const arguments_ = [error.message, error];
        if (isRuntimeFunction(report))
            Reflect.apply(report, sink, projectLogArguments(scope, arguments_));
    }
    catch {
    }
}
function showUnsupportedAlert(scope: PropertyBag | null, currentVersion: string): string {
    const currentLabel = currentVersion || 'unknown';
    const message = [
        'RPG Maker Live Translator detected an old or unknown NW.js runtime.',
        '',
        `Current NW.js: ${currentLabel}`,
        `Minimum NW.js: ${MIN_NW_VERSION} or newer`,
        `Recommended NW.js: ${RECOMMENDED_NW_VERSION} or newer`,
        `Release JavaScript target: ${RELEASE_SYNTAX_TARGET}`,
        '',
        'The translator will try to start anyway, but updating NW.js is recommended.',
    ].join('\n');
    try {
        const scopedAlert = propertyValue(scope, 'alert');
        if (isRuntimeFunction(scopedAlert)) {
            Reflect.apply(scopedAlert, scope, [message]);
        }
        else {
            const fallbackAlert = propertyValue(globalThis, 'alert');
            if (isRuntimeFunction(fallbackAlert))
                Reflect.apply(fallbackAlert, globalThis, [message]);
        }
    }
    catch {
    }
    consoleWarning(scope, message);
    return message;
}
function warnOutdatedNwVersion(scope: PropertyBag | null, currentVersion: string): string {
    const message = [
        `[LiveTranslatorLoader][Compat] Detected NW.js version ${currentVersion};`,
        `recommended ${RECOMMENDED_NW_VERSION} or newer.`,
        'The translator will try to start, but updating NW.js is recommended.',
    ].join(' ');
    consoleWarning(scope, message);
    return message;
}
function shouldAlertUnsupportedNwVersion(version: string): boolean {
    return !version || compareVersions(version, MIN_NW_VERSION) < 0;
}
function getCurrentScript(documentValue: unknown): unknown {
    if (!documentValue)
        return null;
    const currentScript = propertyValue(documentValue, 'currentScript');
    if (currentScript)
        return currentScript;
    const getElementsByTagName = propertyValue(documentValue, 'getElementsByTagName');
    if (!isRuntimeFunction(getElementsByTagName))
        return null;
    const scripts: unknown = Reflect.apply(getElementsByTagName, documentValue, ['script']);
    const lengthValue = propertyValue(scripts, 'length');
    if (!scripts || !lengthValue)
        return null;
    return propertyValue(scripts, Number(lengthValue) - 1);
}
function stripUrlSuffixes(source: unknown): string {
    let value = stringValue(truthyOr(source, ''));
    const hashIndex = value.indexOf('#');
    if (hashIndex >= 0)
        value = value.slice(0, hashIndex);
    const queryIndex = value.indexOf('?');
    if (queryIndex >= 0)
        value = value.slice(0, queryIndex);
    return value;
}
function resolveSiblingScriptUrl(script: unknown, fileName: string): string {
    let source = propertyValue(script, 'src');
    if (!source) {
        const getAttribute = propertyValue(script, 'getAttribute');
        if (isRuntimeFunction(getAttribute))
            source = Reflect.apply(getAttribute, script, ['src']);
    }
    const cleanSource = stripUrlSuffixes(source);
    const slashIndex = cleanSource.lastIndexOf('/');
    const backslashIndex = cleanSource.lastIndexOf('\\');
    const baseIndex = Math.max(slashIndex, backslashIndex);
    return baseIndex >= 0 ? cleanSource.slice(0, baseIndex + 1) + fileName : fileName;
}
function injectRuntimeLoader(scope: PropertyBag | null, startedAt: number): void {
    const documentValue = propertyValue(scope, 'document');
    const createElement = propertyValue(documentValue, 'createElement');
    if (!documentValue || !isRuntimeFunction(createElement)) {
        throw new Error('[LiveTranslatorLoader] No document context available.');
    }
    const parent = truthyOr(propertyValue(documentValue, 'head'), propertyValue(documentValue, 'documentElement'));
    const appendChild = propertyValue(parent, 'appendChild');
    if (!parent || !isRuntimeFunction(appendChild)) {
        throw new Error('[LiveTranslatorLoader] Document has no script insertion point.');
    }
    const tag: unknown = Reflect.apply(createElement, documentValue, ['script']);
    if (!isPropertyBag(tag)) {
        throw new Error('[LiveTranslatorLoader] Document did not create a script element.');
    }
    tag['src'] = resolveSiblingScriptUrl(getCurrentScript(documentValue), RUNTIME_LOADER_FILE);
    tag['async'] = false;
    tag['onerror'] = (): void => {
        publishRuntimeLoaderFailure(scope, startedAt, new Error(`[LiveTranslatorLoader] Failed to load ${RUNTIME_LOADER_FILE}.`));
    };
    Reflect.apply(appendChild, parent, [tag]);
}
function run(): void {
    const scope = getScope();
    const currentVersion = detectNwVersion(scope);
    if (shouldAlertUnsupportedNwVersion(currentVersion)) {
        showUnsupportedAlert(scope, currentVersion);
    }
    else if (shouldWarnNwVersion(currentVersion)) {
        warnOutdatedNwVersion(scope, currentVersion);
    }
    const startedAt = Date.now();
    try {
        injectRuntimeLoader(scope, startedAt);
    }
    catch (error) {
        publishRuntimeLoaderFailure(scope, startedAt, error instanceof Error ? error : new Error(stringValue(error)));
        throw error;
    }
}
run();
export {};
