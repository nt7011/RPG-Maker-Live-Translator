import type { CancellationModule } from '../cancellation.js';
import { normalizeLlamafileConfig as parseLlamafileConfig, type LlamafileConfig, normalizeLlamaCppConfig as parseLlamaCppConfig, normalizeLmStudioConfig as parseLmStudioConfig, normalizeMockTranslatorConfig as parseMockTranslatorConfig, normalizeProviderName as parseProviderName, normalizeProviderSelection, MAX_PROVIDER_TIMEOUT_MS, type LlamaCppConfig, type LmStudioConfig, type MockTranslatorConfig, type NormalizedProviderSelection, } from './provider-schema.js';
export type { LlamafileConfig, LlamaCppConfig, LmStudioConfig, MockTranslatorConfig } from './provider-schema.js';
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object;
type Falsy = false | 0 | 0n | '' | null | undefined;
type StringCoercionCandidate = string | number | boolean | bigint | symbol | null | undefined;
type RuntimeFunction = (...args: unknown[]) => unknown;
type TimeoutScheduler = (callback: () => void, delay: number) => unknown;
type TimeoutCanceler = (handle: unknown) => unknown;
interface RuntimeScopeCandidate {
    readonly LiveTranslatorSettings?: unknown;
    readonly LiveTranslatorConfig?: unknown;
    readonly fetch?: unknown;
    readonly AbortController?: unknown;
    readonly setTimeout?: unknown;
    readonly clearTimeout?: unknown;
}
interface RuntimeAbortControllerCandidate {
    readonly signal: unknown;
    readonly abort?: unknown;
}
type RuntimeAbortControllerConstructor = new () => RuntimeAbortControllerCandidate;
interface RuntimeTransportCapabilities {
    readonly fetch: RuntimeFunction | null;
    readonly AbortController: unknown;
    readonly scheduleTimeout: TimeoutScheduler | null;
    readonly cancelTimeout: TimeoutCanceler | null;
}
interface LoggerCandidate {
    readonly debug?: unknown;
    readonly warn?: unknown;
    readonly error?: unknown;
}
interface ProviderCapabilitiesCandidate {
    readonly streaming?: unknown;
    readonly tracksAvailability?: unknown;
    readonly requiresVerifiedCapacity?: unknown;
}
interface ProviderRequestErrorOptionsCandidate {
    readonly cause?: unknown;
    readonly code?: unknown;
    readonly status?: unknown;
    readonly retryable?: unknown;
    readonly retryAfter?: unknown;
}
interface ErrorCandidate {
    readonly name?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
    readonly status?: unknown;
    readonly retryable?: unknown;
    readonly retryAfter?: unknown;
}
interface MutableErrorCandidate {
    code?: unknown;
    retryable?: unknown;
}
interface LinkedAbortOptionsCandidate {
    readonly signal?: unknown;
    readonly timeoutMs?: unknown;
}
interface AbortSignalCandidate {
    readonly aborted?: unknown;
    readonly reason?: unknown;
    readonly addEventListener?: unknown;
    readonly removeEventListener?: unknown;
}
interface LinkedAbortCandidate {
    readonly getAbortReason?: unknown;
}
interface LmStudioApiConfigCandidate {
    readonly address?: unknown;
    readonly port?: unknown;
}
interface ThinkTagClassification {
    readonly status: 'complete' | 'partial' | 'invalid';
    readonly length: number;
    readonly selfClosing: boolean;
}
interface TagNamePrefixMatch {
    readonly valid: boolean;
    readonly complete: boolean;
    readonly index: number;
}
function truthyOr<Value, Fallback>(value: Value, fallback: () => Fallback): Exclude<Value, Falsy> | Fallback {
    if (value)
        return value as Exclude<Value, Falsy>;
    return fallback();
}
function stringCoercionInput(value: unknown): StringCoercionCandidate {
    return value as StringCoercionCandidate;
}
function indexedCharacter(input: string, index: number): string {
    const character = input[index];
    if (character === undefined) {
        throw new RangeError('Provider tag parser read beyond its buffered input.');
    }
    return character;
}
function bindRuntimeCapability(runtimeScope: unknown, capability: unknown): RuntimeFunction | null {
    if (typeof capability !== 'function')
        return null;
    return (...args: unknown[]): unknown => Reflect.apply(capability as RuntimeFunction, runtimeScope, args);
}
function captureRuntimeTransportCapabilities(runtimeScope: unknown): Readonly<RuntimeTransportCapabilities> {
    if (runtimeScope === null || (typeof runtimeScope !== 'object' && typeof runtimeScope !== 'function')) {
        throw new TypeError('Translation provider runtime scope must be an object.');
    }
    const scope = runtimeScope as RuntimeScopeCandidate;
    const fetch = scope.fetch;
    const AbortControllerConstructor = scope.AbortController;
    const scheduleTimeout = scope.setTimeout;
    const cancelTimeout = scope.clearTimeout;
    return Object.freeze({
        fetch: bindRuntimeCapability(runtimeScope, fetch),
        AbortController: AbortControllerConstructor,
        scheduleTimeout: bindRuntimeCapability(runtimeScope, scheduleTimeout),
        cancelTimeout: bindRuntimeCapability(runtimeScope, cancelTimeout),
    });
}
export interface ProviderRequestErrorInstance extends Error {
    readonly cause?: unknown;
    readonly code?: unknown;
    readonly status?: number;
    readonly retryable?: unknown;
    readonly retryAfter?: number;
}
export type ProviderRequestErrorConstructor = new (message?: unknown, options?: unknown) => ProviderRequestErrorInstance;
export interface BoundProviderLogger {
    readonly debug: RuntimeFunction;
    readonly warn: RuntimeFunction;
    readonly error: RuntimeFunction;
}
export interface TranslationProviderCapabilities {
    readonly streaming: boolean;
    readonly tracksAvailability: boolean;
    readonly requiresVerifiedCapacity: boolean;
}
export interface LinkedAbort {
    readonly signal: unknown;
    cleanup(): void;
    getAbortReason(): unknown;
    getAbortOrigin(): 'parent' | 'timeout' | null;
}
export interface ThinkBlockStripper {
    feed(chunk: unknown): string;
    finish(): string;
}
export interface TranslationProviderCommonModule {
    readonly DEFAULT_LOCAL_MAX_OUTPUT_TOKENS: 512;
    readonly DEFAULT_MODEL_CATALOG_TTL_MS: 5000;
    readonly DEFAULT_MODEL_CATALOG_TIMEOUT_MS: 5000;
    readonly DEFAULT_REQUEST_TIMEOUT_MS: 120000;
    readonly ProviderRequestError: ProviderRequestErrorConstructor;
    noop(): void;
    bindLogger(logger?: unknown): BoundProviderLogger;
    getGlobalSettings(): object;
    getGlobalTranslatorConfig(): object | null;
    assertNoTransportOverrides(options: unknown): void;
    getFetch(): RuntimeFunction;
    finiteNumber(value: unknown): number | null;
    finiteNumber<Fallback>(value: unknown, fallback: Fallback): number | Fallback;
    positiveInteger<Fallback>(value: unknown, fallback: Fallback): number | Fallback;
    normalizeProviderName(value: unknown): string;
    createProviderCapabilities(options?: unknown): Readonly<TranslationProviderCapabilities>;
    normalizeLmStudioConfig(rootConfig?: unknown, settings?: unknown): LmStudioConfig;
    normalizeLlamaCppConfig(rootConfig?: unknown, settings?: unknown): LlamaCppConfig;
    normalizeLlamafileConfig(rootConfig?: unknown, settings?: unknown): LlamafileConfig;
    normalizeMockTranslatorConfig(rootConfig?: unknown): MockTranslatorConfig;
    normalizeProviderSelection(rootConfig: unknown, acquireSettings: () => unknown, providerOverride?: unknown): NormalizedProviderSelection;
    readonly createAbortError: CancellationModule['createAbortError'];
    createTimeoutError(timeoutMs: unknown): Error;
    readonly classifyCancellation: CancellationModule['classifyCancellation'];
    createLinkedAbort(options?: unknown): LinkedAbort;
    coerceFetchError(error: unknown, linkedAbort?: unknown, fallbackMessage?: unknown): unknown;
    createHttpError(message: unknown, status: unknown, retryAfter?: unknown): ProviderRequestErrorInstance;
    createThinkBlockStripper(): ThinkBlockStripper;
    getLmStudioApiBaseUrl(cfg: unknown): string;
}
export function createTranslationProviderCommonModule(cancellation: CancellationModule, runtimeScope: unknown): TranslationProviderCommonModule {
    const DEFAULT_LOCAL_MAX_OUTPUT_TOKENS = 512;
    const DEFAULT_MODEL_CATALOG_TTL_MS = 5000;
    const DEFAULT_MODEL_CATALOG_TIMEOUT_MS = 5000;
    const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
    const { createAbortError, classifyCancellation } = cancellation;
    const runtimeTransport = captureRuntimeTransportCapabilities(runtimeScope);
    class ProviderRequestError extends Error implements ProviderRequestErrorInstance {
        declare cause?: unknown;
        declare code?: unknown;
        declare status?: number;
        declare retryable?: unknown;
        declare retryAfter?: number;
        constructor(message?: unknown, options: unknown = {}) {
            const messageValue = message as FalsySensitiveValue;
            super(String(stringCoercionInput(truthyOr(messageValue, () => 'Translation provider request failed.'))));
            this.name = 'ProviderRequestError';
            const candidate = options as ProviderRequestErrorOptionsCandidate;
            const hasCause = Object.prototype.hasOwnProperty.call(options, 'cause');
            const cause = hasCause ? candidate.cause : undefined;
            const code = candidate.code;
            const statusValue = candidate.status;
            const retryable = candidate.retryable;
            const retryAfterValue = candidate.retryAfter;
            if (hasCause)
                this.cause = cause;
            if (typeof code === 'string' && code)
                this.code = code;
            if (statusValue !== null && statusValue !== undefined && statusValue !== '') {
                try {
                    const status = Number(statusValue);
                    if (Number.isFinite(status)) {
                        this.status = status;
                    }
                }
                catch {
                }
            }
            if (typeof retryable === 'boolean')
                this.retryable = retryable;
            try {
                const retryAfter = Number(retryAfterValue);
                if (Number.isFinite(retryAfter) && retryAfter > 0) {
                    this.retryAfter = retryAfter;
                }
            }
            catch {
            }
        }
    }
    function noop(): void {
        return;
    }
    function bindLogger(logger: unknown = {}): BoundProviderLogger {
        const candidate = logger as LoggerCandidate;
        const debug = candidate.debug;
        const boundDebug = typeof debug === 'function' ? (debug as RuntimeFunction).bind(logger) : noop;
        const warn = candidate.warn;
        const boundWarn = typeof warn === 'function' ? (warn as RuntimeFunction).bind(logger) : noop;
        const error = candidate.error;
        const boundError = typeof error === 'function' ? (error as RuntimeFunction).bind(logger) : noop;
        return {
            debug: boundDebug,
            warn: boundWarn,
            error: boundError,
        };
    }
    function getGlobalSettings(): object {
        const scopeValue = runtimeScope as FalsySensitiveValue;
        const scope = runtimeScope as RuntimeScopeCandidate;
        const settings = scopeValue && scope.LiveTranslatorSettings;
        return settings && typeof settings === 'object' ? settings : {};
    }
    function getGlobalTranslatorConfig(): object | null {
        const scopeValue = runtimeScope as FalsySensitiveValue;
        const scope = runtimeScope as RuntimeScopeCandidate;
        const config = scopeValue && scope.LiveTranslatorConfig;
        return config && typeof config === 'object' ? config : null;
    }
    function assertNoTransportOverrides(options: unknown): void {
        if (options === null || (typeof options !== 'object' && typeof options !== 'function'))
            return;
        if (Reflect.has(options, 'fetch') || Reflect.has(options, 'fetchImpl')) {
            throw new TypeError('Translation provider fetch must be injected through the common runtime scope, not provider options.');
        }
    }
    function getFetch(): RuntimeFunction {
        if (!runtimeTransport.fetch) {
            throw new Error('[LiveTranslator] global fetch is unavailable.');
        }
        return runtimeTransport.fetch;
    }
    function finiteNumber(value: unknown): number | null;
    function finiteNumber<Fallback>(value: unknown, fallback: Fallback): number | Fallback;
    function finiteNumber(value: unknown, fallback: unknown = null): unknown {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }
    function positiveInteger<Fallback>(value: unknown, fallback: Fallback): number | Fallback {
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
    }
    function normalizeProviderName(value: unknown): string {
        return parseProviderName(value);
    }
    function createProviderCapabilities(options: unknown = {}): Readonly<TranslationProviderCapabilities> {
        const optionsValue = options as FalsySensitiveValue;
        const source = optionsValue && typeof options === 'object' ? options : {};
        const candidate = source as ProviderCapabilitiesCandidate;
        return Object.freeze({
            streaming: candidate.streaming === true,
            tracksAvailability: candidate.tracksAvailability === true,
            requiresVerifiedCapacity: candidate.requiresVerifiedCapacity === true,
        });
    }
    function normalizeLmStudioConfig(rootConfig: unknown = {}, settings: unknown = {}): LmStudioConfig {
        return parseLmStudioConfig(rootConfig, settings);
    }
    function normalizeLlamaCppConfig(rootConfig: unknown = {}, settings: unknown = {}): LlamaCppConfig {
        return parseLlamaCppConfig(rootConfig, settings);
    }
    function normalizeLlamafileConfig(rootConfig: unknown = {}, settings: unknown = {}): LlamafileConfig {
        return parseLlamafileConfig(rootConfig, settings);
    }
    function normalizeMockTranslatorConfig(rootConfig: unknown = {}): MockTranslatorConfig {
        return parseMockTranslatorConfig(rootConfig);
    }
    function createTimeoutError(timeoutMs: unknown): Error {
        const timeoutValue = timeoutMs as string;
        const error = new Error(`Translation request timed out after ${timeoutValue}ms.`);
        try {
            error.name = 'TimeoutError';
        }
        catch {
        }
        try {
            (error as MutableErrorCandidate).code = 'ETIMEDOUT';
        }
        catch {
        }
        try {
            (error as MutableErrorCandidate).retryable = true;
        }
        catch {
        }
        return error;
    }
    function createLinkedAbort(options: unknown = {}): LinkedAbort {
        const candidate = options as LinkedAbortOptionsCandidate;
        const parentSignal = truthyOr(candidate.signal, () => null);
        const timeoutMs = Math.min(positiveInteger(candidate.timeoutMs, 0), MAX_PROVIDER_TIMEOUT_MS);
        const AbortControllerConstructor = runtimeTransport.AbortController;
        if (typeof AbortControllerConstructor !== 'function') {
            throw new TypeError('Linked abort requires AbortController from the provider runtime scope.');
        }
        const controller = new (AbortControllerConstructor as RuntimeAbortControllerConstructor)();
        const linkedSignal = controller.signal;
        const abortController = controller.abort;
        if (typeof abortController !== 'function') {
            throw new TypeError('AbortController is missing its abort capability.');
        }
        let abortReason: unknown;
        let hasAbortReason = false;
        let abortOrigin: 'parent' | 'timeout' | null = null;
        let terminalClaimed = false;
        let cleanupClaimed = false;
        let timeoutOwned = false;
        let timeoutHandle: unknown;
        const timeoutCapabilities: {
            schedule: TimeoutScheduler | null;
            cancel: TimeoutCanceler | null;
        } = {
            schedule: null,
            cancel: null,
        };
        let listenerOwned = false;
        let listenerAcquiring = false;
        let removeParentAbortListener: RuntimeFunction | null = null;
        let signalReasonObservationClaimed = false;
        const acquireTimeoutCapabilities = (): void => {
            if (timeoutMs <= 0 || timeoutCapabilities.schedule)
                return;
            const scheduleCandidate = runtimeTransport.scheduleTimeout;
            const cancelCandidate = runtimeTransport.cancelTimeout;
            if (!scheduleCandidate || !cancelCandidate) {
                throw new TypeError('Linked abort timeout requires paired scheduling and cancellation capabilities from the provider runtime scope.');
            }
            timeoutCapabilities.schedule = scheduleCandidate;
            timeoutCapabilities.cancel = cancelCandidate;
        };
        const releaseTimeout = (): void => {
            if (!timeoutOwned)
                return;
            timeoutOwned = false;
            const ownedHandle = timeoutHandle;
            timeoutHandle = undefined;
            const cancel = timeoutCapabilities.cancel;
            if (!cancel)
                return;
            try {
                cancel(ownedHandle);
            }
            catch {
            }
        };
        const releaseParentListener = (): void => {
            if (!listenerOwned || listenerAcquiring)
                return;
            listenerOwned = false;
            if (!parentSignal || !removeParentAbortListener)
                return;
            try {
                Reflect.apply(removeParentAbortListener, parentSignal, ['abort', onParentAbort]);
            }
            catch {
            }
        };
        const releaseOwnedResources = (): void => {
            releaseTimeout();
            releaseParentListener();
        };
        const claimTerminal = (origin: 'parent' | 'timeout'): boolean => {
            if (terminalClaimed || cleanupClaimed)
                return false;
            terminalClaimed = true;
            abortOrigin = origin;
            return true;
        };
        const commitAbort = (reason: unknown): void => {
            abortReason = reason;
            hasAbortReason = true;
            try {
                Reflect.apply(abortController, controller, [abortReason]);
            }
            catch {
                try {
                    Reflect.apply(abortController, controller, []);
                }
                catch {
                }
            }
        };
        const observeParentAbort = (): void => {
            if (!claimTerminal('parent'))
                return;
            let reason: unknown;
            try {
                reason = createAbortError((parentSignal as AbortSignalCandidate).reason);
            }
            catch (error) {
                reason = error;
            }
            commitAbort(reason);
            releaseOwnedResources();
        };
        const onParentAbort = (): void => {
            observeParentAbort();
        };
        const onTimeout = (): void => {
            if (!claimTerminal('timeout'))
                return;
            timeoutOwned = false;
            timeoutHandle = undefined;
            let reason: unknown;
            try {
                reason = createTimeoutError(timeoutMs);
            }
            catch (error) {
                reason = error;
            }
            commitAbort(reason);
            releaseParentListener();
        };
        const parent = parentSignal as AbortSignalCandidate;
        try {
            acquireTimeoutCapabilities();
            if (parentSignal) {
                if (parent.aborted === true) {
                    observeParentAbort();
                }
                else {
                    const addListenerCandidate = parent.addEventListener;
                    const addParentAbortListener = typeof addListenerCandidate === 'function' ? (addListenerCandidate as RuntimeFunction) : null;
                    if (addParentAbortListener) {
                        const removeListenerCandidate = parent.removeEventListener;
                        removeParentAbortListener =
                            typeof removeListenerCandidate === 'function'
                                ? (removeListenerCandidate as RuntimeFunction)
                                : null;
                        if (!removeParentAbortListener) {
                            throw new TypeError('Linked abort registration requires a removal capability.');
                        }
                        listenerOwned = true;
                        listenerAcquiring = true;
                        try {
                            Reflect.apply(addParentAbortListener, parentSignal, [
                                'abort',
                                onParentAbort,
                                { once: true },
                            ]);
                        }
                        finally {
                            listenerAcquiring = false;
                        }
                        if (!terminalClaimed && parent.aborted === true)
                            observeParentAbort();
                        if (terminalClaimed)
                            releaseParentListener();
                    }
                }
            }
            const schedule = timeoutCapabilities.schedule;
            if (timeoutMs > 0 && !terminalClaimed && schedule) {
                const acquiredHandle = schedule(onTimeout, timeoutMs);
                timeoutHandle = acquiredHandle;
                timeoutOwned = true;
                if (terminalClaimed || cleanupClaimed)
                    releaseTimeout();
            }
        }
        catch (error) {
            cleanupClaimed = true;
            releaseOwnedResources();
            throw error;
        }
        return {
            signal: linkedSignal,
            cleanup() {
                if (cleanupClaimed)
                    return;
                cleanupClaimed = true;
                releaseOwnedResources();
            },
            getAbortReason() {
                if (hasAbortReason)
                    return abortReason;
                if (signalReasonObservationClaimed)
                    return null;
                signalReasonObservationClaimed = true;
                try {
                    const signalReason = (linkedSignal as AbortSignalCandidate).reason;
                    return signalReason === undefined ? null : signalReason;
                }
                finally {
                    signalReasonObservationClaimed = false;
                }
            },
            getAbortOrigin() {
                return abortOrigin;
            },
        };
    }
    function coerceFetchError(error: unknown, linkedAbort: unknown = null, fallbackMessage: unknown = 'Request failed'): unknown {
        let abortReason: unknown = null;
        try {
            const linkedAbortValue = linkedAbort as FalsySensitiveValue;
            const linkedAbortCandidate = linkedAbort as LinkedAbortCandidate;
            const getAbortReason = linkedAbortValue ? linkedAbortCandidate.getAbortReason : undefined;
            if (typeof getAbortReason === 'function') {
                abortReason = Reflect.apply(getAbortReason, linkedAbort, []);
            }
        }
        catch {
        }
        if (abortReason !== null) {
            const abortClassification = classifyCancellation(abortReason);
            if (abortClassification.code === 'ETIMEDOUT')
                return abortClassification.error;
            if (abortClassification.kind === 'cancellation') {
                return abortClassification.error;
            }
        }
        try {
            if (error instanceof ProviderRequestError)
                return error;
        }
        catch {
        }
        const classification = classifyCancellation(error);
        const operationalError = classification.error;
        if (classification.kind === 'cancellation') {
            return createAbortError(abortReason === null ? operationalError : abortReason);
        }
        const errorValue = operationalError as FalsySensitiveValue;
        const errorCandidate = operationalError as ErrorCandidate;
        const metadata: {
            cause: unknown;
            code?: unknown;
            retryAfter?: unknown;
            retryable?: unknown;
            status?: unknown;
        } = { cause: operationalError };
        const detail: unknown = classification.message || 'translation failed';
        if (errorValue && (typeof operationalError === 'object' || typeof operationalError === 'function')) {
            metadata.code = classification.code;
            try {
                metadata.status = errorCandidate.status;
            }
            catch {
            }
            try {
                metadata.retryable = errorCandidate.retryable;
            }
            catch {
            }
            try {
                metadata.retryAfter = errorCandidate.retryAfter;
            }
            catch {
            }
        }
        let prefix = 'Request failed';
        try {
            prefix = String(fallbackMessage);
        }
        catch {
        }
        let detailText = 'translation failed';
        try {
            detailText = String(detail);
        }
        catch {
        }
        return new ProviderRequestError(`${prefix}: ${detailText}`, metadata);
    }
    function createHttpError(message: unknown, status: unknown, retryAfter: unknown = null): ProviderRequestError {
        const numericStatus = Number(status);
        const options: {
            status: number;
            retryAfter: unknown;
            retryable?: boolean;
        } = {
            status: numericStatus,
            retryAfter,
        };
        if (numericStatus === 429 || (numericStatus >= 500 && numericStatus <= 599)) {
            options.retryable = true;
        }
        return new ProviderRequestError(message, options);
    }
    function createThinkBlockStripper(): ThinkBlockStripper {
        const MAX_PARTIAL_TAG_LENGTH = 256;
        let buffer = '';
        let inThink = false;
        function drain(final = false): string {
            let out = '';
            while (buffer) {
                const marker = buffer.indexOf('<');
                if (marker === -1) {
                    if (!inThink)
                        out += buffer;
                    buffer = '';
                    break;
                }
                if (marker > 0) {
                    if (!inThink)
                        out += buffer.slice(0, marker);
                    buffer = buffer.slice(marker);
                }
                const tag = classifyThinkTag(buffer, inThink ? 'close' : 'open', MAX_PARTIAL_TAG_LENGTH);
                if (tag.status === 'complete') {
                    buffer = buffer.slice(tag.length);
                    if (inThink)
                        inThink = false;
                    else if (!tag.selfClosing)
                        inThink = true;
                    continue;
                }
                if (tag.status === 'partial' && !final)
                    break;
                if (tag.status === 'partial') {
                    if (!inThink)
                        out += buffer;
                    buffer = '';
                    break;
                }
                if (!inThink)
                    out += indexedCharacter(buffer, 0);
                buffer = buffer.slice(1);
            }
            return out;
        }
        return {
            feed(chunk: unknown) {
                const chunkValue = chunk as FalsySensitiveValue;
                buffer += String(stringCoercionInput(truthyOr(chunkValue, () => '')));
                return drain(false);
            },
            finish() {
                const out = drain(true);
                inThink = false;
                return out;
            },
        };
    }
    function classifyThinkTag(input: string, kind: 'close' | 'open', maxPartialLength: number): ThinkTagClassification {
        const end = findBoundedUnquotedTagEnd(input, maxPartialLength);
        if (end >= 0) {
            const candidate = input.slice(0, end + 1);
            const complete = kind === 'close' ? /^<\s*\/\s*think\s*>$/iu.test(candidate) : /^<\s*think\b[\s\S]*>$/iu.test(candidate);
            if (!complete)
                return { status: 'invalid', length: 0, selfClosing: false };
            return {
                status: 'complete',
                length: candidate.length,
                selfClosing: kind === 'open' && /\/\s*>$/u.test(candidate),
            };
        }
        if (input.length > maxPartialLength) {
            return { status: 'invalid', length: 0, selfClosing: false };
        }
        const partial = kind === 'close' ? isPartialThinkCloseTag(input) : isPartialThinkOpenTag(input);
        return {
            status: partial ? 'partial' : 'invalid',
            length: 0,
            selfClosing: false,
        };
    }
    function findBoundedUnquotedTagEnd(input: string, maxLength: number): number {
        let quote = '';
        const limit = Math.min(input.length, maxLength);
        for (let index = 1; index < limit; index += 1) {
            const character = indexedCharacter(input, index);
            if (quote) {
                if (character === quote)
                    quote = '';
                continue;
            }
            if (character === '"' || character === "'") {
                quote = character;
                continue;
            }
            if (character === '>')
                return index;
        }
        return -1;
    }
    function isPartialThinkOpenTag(input: string): boolean {
        let index = skipTagWhitespace(input, 1);
        const matched = matchTagNamePrefix(input, index);
        if (!matched.valid || !matched.complete)
            return matched.valid;
        index = matched.index;
        return index >= input.length || !/[A-Za-z0-9_]/u.test(indexedCharacter(input, index));
    }
    function isPartialThinkCloseTag(input: string): boolean {
        let index = skipTagWhitespace(input, 1);
        if (index >= input.length)
            return true;
        if (input[index] !== '/')
            return false;
        index = skipTagWhitespace(input, index + 1);
        const matched = matchTagNamePrefix(input, index);
        if (!matched.valid || !matched.complete)
            return matched.valid;
        index = skipTagWhitespace(input, matched.index);
        return index === input.length;
    }
    function matchTagNamePrefix(input: string, start: number): TagNamePrefixMatch {
        const name = 'think';
        let index = start;
        let offset = 0;
        while (offset < name.length) {
            if (index >= input.length) {
                return { valid: true, complete: false, index };
            }
            if (indexedCharacter(input, index).toLowerCase() !== indexedCharacter(name, offset)) {
                return { valid: false, complete: false, index };
            }
            index += 1;
            offset += 1;
        }
        return { valid: true, complete: true, index };
    }
    function skipTagWhitespace(input: string, start: number): number {
        let index = start;
        while (index < input.length && /\s/u.test(indexedCharacter(input, index)))
            index += 1;
        return index;
    }
    function getLmStudioApiBaseUrl(cfg: unknown): string {
        const candidate = cfg as LmStudioApiConfigCandidate;
        return `http://${candidate.address as string}:${candidate.port as string}`;
    }
    return {
        DEFAULT_LOCAL_MAX_OUTPUT_TOKENS,
        DEFAULT_MODEL_CATALOG_TTL_MS,
        DEFAULT_MODEL_CATALOG_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS,
        ProviderRequestError,
        noop,
        bindLogger,
        getGlobalSettings,
        getGlobalTranslatorConfig,
        assertNoTransportOverrides,
        getFetch,
        finiteNumber,
        positiveInteger,
        normalizeProviderName,
        createProviderCapabilities,
        normalizeLmStudioConfig,
        normalizeLlamaCppConfig,
        normalizeLlamafileConfig,
        normalizeMockTranslatorConfig,
        normalizeProviderSelection,
        createAbortError,
        createTimeoutError,
        classifyCancellation,
        createLinkedAbort,
        coerceFetchError,
        createHttpError,
        createThinkBlockStripper,
        getLmStudioApiBaseUrl,
    };
}
