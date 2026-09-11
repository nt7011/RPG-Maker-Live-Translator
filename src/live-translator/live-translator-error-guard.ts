import { installCanvasTextAlignmentGuard } from './compatibility/canvas-text-alignment.js';
import { createLogRedactor } from './runtime/log-redaction.js';
declare const main: unknown;
type RuntimeFunction = (...args: never[]) => unknown;
type PropertyBag = Record<PropertyKey, unknown>;
interface ErrorDetails {
    name: string;
    message: string;
    stack: string;
}
interface SuppressedErrorRecord extends ErrorDetails {
    schemaVersion: 1;
    seq: number;
    at: number;
    kind: string;
    source: string;
    line: number;
    column: number;
}
interface GuardSnapshot {
    loaded: true;
    installed: boolean;
    enabled: boolean;
    recordCount: number;
    droppedCount: number;
    maxRecords: number;
    artifactFile: string;
    settingsLoaded: boolean;
    settingsError: string;
}
function parseJsonc(source: string): unknown {
    const input = source.charCodeAt(0) === 0xfeff ? ` ${source.slice(1)}` : source;
    const output = input.split('');
    let insideString = false;
    let escaped = false;
    for (let index = 0; index < input.length; index += 1) {
        const character = input[index];
        if (insideString) {
            if (escaped)
                escaped = false;
            else if (character === '\\')
                escaped = true;
            else if (character === '"')
                insideString = false;
            continue;
        }
        if (character === '"') {
            insideString = true;
            continue;
        }
        if (character !== '/')
            continue;
        const next = input[index + 1];
        if (next === '/') {
            output[index] = ' ';
            output[index + 1] = ' ';
            index += 2;
            while (index < input.length && input[index] !== '\r' && input[index] !== '\n') {
                output[index] = ' ';
                index += 1;
            }
            index -= 1;
            continue;
        }
        if (next !== '*')
            continue;
        const commentStart = index;
        output[index] = ' ';
        output[index + 1] = ' ';
        index += 2;
        let closed = false;
        while (index < input.length) {
            if (input[index] === '*' && input[index + 1] === '/') {
                output[index] = ' ';
                output[index + 1] = ' ';
                index += 1;
                closed = true;
                break;
            }
            if (input[index] !== '\r' && input[index] !== '\n')
                output[index] = ' ';
            index += 1;
        }
        if (!closed)
            throw new SyntaxError(`Unterminated block comment at position ${String(commentStart)}.`);
    }
    insideString = false;
    escaped = false;
    for (let index = 0; index < output.length; index += 1) {
        const character = output[index];
        if (insideString) {
            if (escaped)
                escaped = false;
            else if (character === '\\')
                escaped = true;
            else if (character === '"')
                insideString = false;
            continue;
        }
        if (character === '"') {
            insideString = true;
            continue;
        }
        if (character !== ',')
            continue;
        let nextIndex = index + 1;
        while (nextIndex < output.length && /\s/u.test(output[nextIndex] ?? ''))
            nextIndex += 1;
        if (output[nextIndex] !== '}' && output[nextIndex] !== ']')
            continue;
        let previousIndex = index - 1;
        while (previousIndex >= 0 && /\s/u.test(output[previousIndex] ?? ''))
            previousIndex -= 1;
        if (output[previousIndex] !== '[' && output[previousIndex] !== '{')
            output[index] = ' ';
    }
    return JSON.parse(output.join('')) as unknown;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRuntimeFunction(value: unknown): value is RuntimeFunction {
    return typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    if (!isPropertyBag(value))
        return undefined;
    try {
        return value[key];
    }
    catch {
        return undefined;
    }
}
function installErrorGuard(): void {
    const globalValue: unknown = typeof window !== 'undefined' ? window : globalThis;
    if (!isPropertyBag(globalValue))
        return;
    const scope = globalValue;
    const contextPrototype = propertyValue(scope['CanvasRenderingContext2D'], 'prototype');
    if (isPropertyBag(contextPrototype)) {
        try {
            installCanvasTextAlignmentGuard(contextPrototype);
        }
        catch {
        }
    }
    const existing = scope['LiveTranslatorErrorGuard'];
    if (propertyValue(existing, 'loaded') === true)
        return;
    const MAX_RECORDS = 200;
    const SETTINGS_FILE = 'settings.jsonc';
    const records: SuppressedErrorRecord[] = [];
    let sequence = 0;
    let droppedCount = 0;
    let overflowLogged = false;
    let appendRecord: RuntimeFunction | null = null;
    let artifactFile = '';
    let persistedThroughSequence = 0;
    let enabled = true;
    let listenersInstalled = false;
    let settingsLoaded = false;
    let settingsError = '';
    let suppressionAlertEnabled = true;
    let suppressionAlertShown = false;
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
    function consoleSink(): unknown {
        try {
            const scopedSink = scope['console'];
            if (scopedSink)
                return scopedSink;
            return typeof console !== 'undefined' ? console : null;
        }
        catch {
            return null;
        }
    }
    function warn(message: string): void {
        try {
            const sink = consoleSink();
            const warnMethod = propertyValue(sink, 'warn');
            if (isRuntimeFunction(warnMethod))
                Reflect.apply(warnMethod, sink, [message]);
        }
        catch {
        }
    }
    function currentScript(): unknown {
        const documentValue = scope['document'];
        if (!documentValue)
            return null;
        const directScript = propertyValue(documentValue, 'currentScript');
        if (directScript)
            return directScript;
        const getElementsByTagName = propertyValue(documentValue, 'getElementsByTagName');
        if (!isRuntimeFunction(getElementsByTagName))
            return null;
        const scripts: unknown = Reflect.apply(getElementsByTagName, documentValue, ['script']);
        const lengthValue = propertyValue(scripts, 'length');
        if (!scripts || !lengthValue)
            return null;
        return propertyValue(scripts, Number(lengthValue) - 1);
    }
    function siblingUrl(fileName: string): string {
        const script = currentScript();
        let source: unknown = '';
        if (script) {
            source = propertyValue(script, 'src');
            if (!source) {
                const getAttribute = propertyValue(script, 'getAttribute');
                if (isRuntimeFunction(getAttribute)) {
                    source = Reflect.apply(getAttribute, script, ['src']);
                }
            }
        }
        let value = stringValue(source);
        const hashIndex = value.indexOf('#');
        if (hashIndex >= 0)
            value = value.slice(0, hashIndex);
        const queryIndex = value.indexOf('?');
        if (queryIndex >= 0)
            value = value.slice(0, queryIndex);
        const baseIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
        return baseIndex >= 0 ? value.slice(0, baseIndex + 1) + fileName : fileName;
    }
    function readEarlySettings(): PropertyBag | null {
        try {
            const requestConstructor = scope['XMLHttpRequest'];
            if (!isRuntimeFunction(requestConstructor)) {
                throw new Error('XMLHttpRequest is unavailable');
            }
            const request: unknown = Reflect.construct(requestConstructor, []);
            const open = propertyValue(request, 'open');
            const send = propertyValue(request, 'send');
            if (!isRuntimeFunction(open) || !isRuntimeFunction(send)) {
                throw new Error('XMLHttpRequest is incomplete');
            }
            Reflect.apply(open, request, ['GET', siblingUrl(SETTINGS_FILE), false]);
            Reflect.apply(send, request, [null]);
            const status = Number(propertyValue(request, 'status')) || 0;
            if (status !== 0 && (status < 200 || status >= 300)) {
                throw new Error(`HTTP ${String(status)}`);
            }
            const parsed = parseJsonc(stringValue(propertyValue(request, 'responseText')));
            if (!isPropertyBag(parsed)) {
                throw new Error('settings.jsonc is not an object');
            }
            settingsLoaded = true;
            return parsed;
        }
        catch (error) {
            const message = propertyValue(error, 'message');
            settingsError = message ? stringValue(message) : stringValue(error);
            warn('[LiveTranslator][ErrorGuard] Could not read settings.jsonc before game plugins; using the default enabled state. ' +
                settingsError);
            return null;
        }
    }
    function settingEnabled(settings: unknown): boolean {
        const hacks = propertyValue(settings, 'hacks');
        const suppressGameExceptions = propertyValue(hacks, 'suppressGameExceptions');
        return propertyValue(suppressGameExceptions, 'enabled') !== false;
    }
    function settingAlertEnabled(settings: unknown): boolean {
        const hacks = propertyValue(settings, 'hacks');
        const suppressGameExceptions = propertyValue(hacks, 'suppressGameExceptions');
        return propertyValue(suppressGameExceptions, 'showErrorAlert') !== false;
    }
    function errorDetails(value: unknown, details: unknown): ErrorDetails {
        const error = typeof value === 'object' && value !== null ? value : null;
        const explicitMessage = stringValue(propertyValue(details, 'message'));
        return {
            name: stringValue(propertyValue(error, 'name')) || stringValue(propertyValue(details, 'name')) || 'Error',
            message: explicitMessage ||
                stringValue(propertyValue(error, 'message')) ||
                stringValue(value) ||
                'Unknown error',
            stack: stringValue(propertyValue(error, 'stack')) || stringValue(propertyValue(details, 'stack')),
        };
    }
    function logRecord(record: SuppressedErrorRecord): void {
        try {
            const sink = consoleSink();
            const errorMethod = propertyValue(sink, 'error');
            if (!isRuntimeFunction(errorMethod))
                return;
            const location = record.source
                ? ` (${record.source}${record.line ? `:${String(record.line)}:${String(record.column || 0)}` : ''})`
                : '';
            const stack = record.stack ? `\n${record.stack}` : '';
            const arguments_ = [
                `[LiveTranslator][ErrorGuard] Suppressed ${record.kind}: ${record.name}: ${record.message}${location}${stack}`,
            ];
            Reflect.apply(errorMethod, sink, logRedactor ? (logRedactor.value(arguments_) as unknown[]) : arguments_);
        }
        catch {
        }
    }
    function logOverflow(): void {
        if (overflowLogged)
            return;
        overflowLogged = true;
        try {
            const sink = consoleSink();
            const errorMethod = propertyValue(sink, 'error');
            if (isRuntimeFunction(errorMethod)) {
                Reflect.apply(errorMethod, sink, [
                    `[LiveTranslator][ErrorGuard] Runtime error log reached ${String(MAX_RECORDS)} records; further errors are suppressed and counted.`,
                ]);
            }
        }
        catch {
        }
    }
    function persist(record: SuppressedErrorRecord): void {
        if (!appendRecord || record.seq <= persistedThroughSequence)
            return;
        try {
            Reflect.apply(appendRecord, undefined, [record]);
            persistedThroughSequence = record.seq;
        }
        catch (error) {
            try {
                const sink = consoleSink();
                const errorMethod = propertyValue(sink, 'error');
                const message = propertyValue(error, 'message');
                const errorMessage = message ? stringValue(message) : stringValue(error);
                if (isRuntimeFunction(errorMethod)) {
                    const message = `[LiveTranslator][ErrorGuard] Failed to persist suppressed runtime error: ${errorMessage}`;
                    Reflect.apply(errorMethod, sink, [logRedactor ? logRedactor.text(message) : message]);
                }
            }
            catch {
            }
        }
    }
    function recordError(kind: unknown, value: unknown, details: unknown = {}): SuppressedErrorRecord | null {
        if (!enabled)
            return null;
        if (records.length >= MAX_RECORDS) {
            droppedCount += 1;
            logOverflow();
            return null;
        }
        const normalized = errorDetails(value, details);
        let entry: SuppressedErrorRecord = {
            schemaVersion: 1,
            seq: ++sequence,
            at: Date.now(),
            kind: stringValue(kind) || 'error',
            name: normalized.name,
            message: normalized.message,
            stack: normalized.stack,
            source: stringValue(propertyValue(details, 'source')),
            line: Math.max(0, Math.round(Number(propertyValue(details, 'line')) || 0)),
            column: Math.max(0, Math.round(Number(propertyValue(details, 'column')) || 0)),
        };
        if (logRedactor) {
            try {
                entry = logRedactor.record(entry, ['kind']);
            }
            catch {
                return null;
            }
        }
        records.push(entry);
        logRecord(entry);
        persist(entry);
        return entry;
    }
    function showSuppressionAlert(record: SuppressedErrorRecord | null): void {
        const alert = scope['alert'];
        if (!suppressionAlertEnabled || suppressionAlertShown || !record || !isRuntimeFunction(alert))
            return;
        suppressionAlertShown = true;
        const originalError = `${record.name}: ${record.message}`;
        const message = 'Fatal runtime error\n\n' +
            'Live Translator intercepted and suppressed what is most likely a game-side error.\n\n' +
            'The error may be harmless, such as a version-detection error after an NW.js upgrade. ' +
            'However, the game may now be in an inconsistent state. Continuing may cause data corruption.\n\n' +
            'Original error\n\n' +
            originalError;
        try {
            Reflect.apply(alert, scope, [message]);
        }
        catch {
        }
    }
    function cancelEvent(event: unknown): void {
        try {
            const preventDefault = propertyValue(event, 'preventDefault');
            if (isRuntimeFunction(preventDefault))
                Reflect.apply(preventDefault, event, []);
        }
        catch {
        }
        try {
            const stopImmediatePropagation = propertyValue(event, 'stopImmediatePropagation');
            if (isRuntimeFunction(stopImmediatePropagation))
                Reflect.apply(stopImmediatePropagation, event, []);
        }
        catch {
        }
    }
    function clearRpgMakerBootError(): void {
        try {
            if (typeof main !== 'undefined' && isPropertyBag(main) && 'error' in main) {
                main['error'] = null;
                return;
            }
        }
        catch {
        }
        try {
            const boot = scope['main'];
            if (isPropertyBag(boot) && 'error' in boot)
                boot['error'] = null;
        }
        catch {
        }
    }
    function suppressWindowError(event: unknown): unknown {
        const error = propertyValue(event, 'error');
        const entry = recordError('uncaught-error', error, {
            name: propertyValue(error, 'name'),
            message: propertyValue(event, 'message'),
            source: propertyValue(event, 'filename'),
            line: propertyValue(event, 'lineno'),
            column: propertyValue(event, 'colno'),
        });
        clearRpgMakerBootError();
        cancelEvent(event);
        showSuppressionAlert(entry);
        return false;
    }
    function suppressUnhandledRejection(event: unknown): unknown {
        const reason = propertyValue(event, 'reason');
        const reasonMessage = propertyValue(reason, 'message');
        let message: unknown;
        if (reasonMessage) {
            message = reasonMessage;
        }
        else {
            message = stringValue(reason);
        }
        const entry = recordError('unhandled-rejection', reason, {
            message,
        });
        cancelEvent(event);
        showSuppressionAlert(entry);
        return false;
    }
    function markGuarded(fn: RuntimeFunction, original: RuntimeFunction): RuntimeFunction {
        try {
            Object.defineProperty(fn, '__liveTranslatorErrorGuard', { value: true });
            Object.defineProperty(fn, '__liveTranslatorOriginal', { value: original });
        }
        catch {
        }
        return fn;
    }
    function installSceneManagerGuard(): boolean {
        const sceneManager = scope['SceneManager'];
        if (!enabled || !isPropertyBag(sceneManager))
            return false;
        const catchException = sceneManager['catchException'];
        if (isRuntimeFunction(catchException) && propertyValue(catchException, '__liveTranslatorErrorGuard') !== true) {
            const guarded = (error: unknown): unknown => {
                showSuppressionAlert(recordError('scene-exception', error));
                return undefined;
            };
            try {
                sceneManager['catchException'] = markGuarded(guarded, catchException);
            }
            catch {
            }
        }
        const onError = sceneManager['onError'];
        if (isRuntimeFunction(onError) && propertyValue(onError, '__liveTranslatorErrorGuard') !== true) {
            const guarded = (event: unknown): unknown => suppressWindowError(event);
            try {
                sceneManager['onError'] = markGuarded(guarded, onError);
            }
            catch {
            }
        }
        const onReject = sceneManager['onReject'];
        if (isRuntimeFunction(onReject) && propertyValue(onReject, '__liveTranslatorErrorGuard') !== true) {
            const guarded = (event: unknown): unknown => suppressUnhandledRejection(event);
            try {
                sceneManager['onReject'] = markGuarded(guarded, onReject);
            }
            catch {
            }
        }
        return true;
    }
    function restoreSceneManagerGuard(): void {
        const sceneManager = scope['SceneManager'];
        if (!isPropertyBag(sceneManager))
            return;
        const names: readonly string[] = ['catchException', 'onError', 'onReject'];
        for (const name of names) {
            const current = sceneManager[name];
            const original = propertyValue(current, '__liveTranslatorOriginal');
            if (isRuntimeFunction(current) &&
                propertyValue(current, '__liveTranslatorErrorGuard') === true &&
                isRuntimeFunction(original)) {
                try {
                    sceneManager[name] = original;
                }
                catch {
                }
            }
        }
    }
    function installListeners(): void {
        const addEventListener = scope['addEventListener'];
        if (listenersInstalled || !isRuntimeFunction(addEventListener))
            return;
        Reflect.apply(addEventListener, scope, ['error', suppressWindowError, true]);
        Reflect.apply(addEventListener, scope, ['unhandledrejection', suppressUnhandledRejection, true]);
        listenersInstalled = true;
    }
    function removeListeners(): void {
        const removeEventListener = scope['removeEventListener'];
        if (!listenersInstalled || !isRuntimeFunction(removeEventListener))
            return;
        Reflect.apply(removeEventListener, scope, ['error', suppressWindowError, true]);
        Reflect.apply(removeEventListener, scope, ['unhandledrejection', suppressUnhandledRejection, true]);
        listenersInstalled = false;
    }
    function snapshot(): GuardSnapshot {
        return {
            loaded: true,
            installed: enabled && listenersInstalled,
            enabled,
            recordCount: records.length,
            droppedCount,
            maxRecords: MAX_RECORDS,
            artifactFile,
            settingsLoaded,
            settingsError,
        };
    }
    function setEnabled(nextEnabled: unknown): GuardSnapshot {
        enabled = nextEnabled !== false;
        if (enabled) {
            installListeners();
            installSceneManagerGuard();
        }
        else {
            removeListeners();
            restoreSceneManagerGuard();
        }
        return snapshot();
    }
    function applySettings(settings: unknown): GuardSnapshot {
        suppressionAlertEnabled = settingAlertEnabled(settings);
        return setEnabled(settingEnabled(settings));
    }
    function configure(options: unknown = {}): GuardSnapshot {
        const configuredAppendRecord = propertyValue(options, 'appendRecord');
        appendRecord = isRuntimeFunction(configuredAppendRecord) ? configuredAppendRecord : null;
        artifactFile = stringValue(propertyValue(options, 'artifactFile'));
        persistedThroughSequence = 0;
        if (appendRecord) {
            for (const existingRecord of records)
                persist(existingRecord);
        }
        installSceneManagerGuard();
        return snapshot();
    }
    const earlySettings = readEarlySettings();
    const logRedactor = createLogRedactor(earlySettings);
    scope['LiveTranslatorErrorGuard'] = {
        loaded: true,
        logRedactor,
        applySettings,
        configure,
        installSceneManagerGuard,
        record: recordError,
        records: (): SuppressedErrorRecord[] => records.slice(),
        setEnabled,
        snapshot,
    };
    applySettings(earlySettings);
}
installErrorGuard();
export {};
