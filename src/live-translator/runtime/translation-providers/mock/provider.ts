import type { TranslationProviderCapabilities, TranslationProviderCommonModule } from '../common.js';
import { createTranslationProviderRuntimeStatus, type TranslationProviderRuntimeStatus } from '../runtime-status.js';
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object;
interface MockProviderCommonDependencies {
    readonly createAbortError: (reason?: unknown) => Error;
    readonly createProviderCapabilities: (options?: unknown) => Readonly<TranslationProviderCapabilities>;
    readonly getGlobalTranslatorConfig: () => object | null;
    readonly normalizeMockTranslatorConfig: (rootConfig?: unknown) => MockTranslatorConfig;
}
interface MockTranslationOptionsCandidate {
    readonly useRandomizedStrings?: unknown;
    readonly random?: unknown;
}
interface MockProviderOptionsCandidate {
    readonly translatorConfig?: unknown;
}
interface MockProviderRequestCandidate {
    readonly text?: unknown;
    readonly signal?: unknown;
}
interface AbortSignalCandidate {
    readonly aborted?: unknown;
    readonly reason?: unknown;
    addEventListener?(type: string, listener: () => void, options: unknown): unknown;
    removeEventListener?(type: string, listener: () => void): unknown;
}
export interface MockTranslatorConfig {
    readonly capacity: number;
    readonly delayMs: number;
    readonly useRandomizedStrings: boolean;
}
export interface MockTranslatorProvider {
    kind: 'mockTranslator';
    capabilities: Readonly<TranslationProviderCapabilities>;
    config: Readonly<MockTranslatorConfig>;
    getCapacity(): Promise<number>;
    getRuntimeStatus(): Readonly<TranslationProviderRuntimeStatus>;
    translate(request?: unknown): Promise<string>;
}
export interface MockTranslatorProviderModule {
    createMockTranslatorProvider(options?: unknown): MockTranslatorProvider;
    mockTranslateText(text: unknown, options?: unknown): string;
    normalizeMockTranslatorConfig(rootConfig?: unknown): MockTranslatorConfig;
    waitForMockDelay(delayMs: unknown, signal: unknown): Promise<void>;
}
export function createMockTranslatorProviderModule(common: TranslationProviderCommonModule): MockTranslatorProviderModule {
    const { createAbortError, createProviderCapabilities, getGlobalTranslatorConfig, normalizeMockTranslatorConfig: normalizeMockConfig, } = common as MockProviderCommonDependencies;
    const PROVIDER_CAPABILITIES = createProviderCapabilities({ streaming: false });
    const DEFAULT_MOCK_DELAY_MS = 100;
    const CJK_MARKERS = '가나다라마바사아';
    const LATIN_MARKERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const LATIN_RANDOM_MARKERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const CJK_LETTER_PATTERN = /(?=\p{Alphabetic})(?:\p{Script_Extensions=Hangul}|\p{Script_Extensions=Hiragana}|\p{Script_Extensions=Katakana}|\p{Script_Extensions=Han})/u;
    const LATIN_LETTER_PATTERN = /(?=\p{Alphabetic})\p{Script_Extensions=Latin}/u;
    function normalizeMockTranslatorConfig(rootConfig: unknown = {}): Readonly<MockTranslatorConfig> {
        return normalizeMockConfig(rootConfig);
    }
    function createMockTranslatorProvider(options: unknown = {}): MockTranslatorProvider {
        const source = options as MockProviderOptionsCandidate;
        const configuredRoot = source.translatorConfig;
        const internalConfig = normalizeMockTranslatorConfig(configuredRoot || getGlobalTranslatorConfig());
        const exposedConfig = Object.freeze({ ...internalConfig });
        return {
            kind: 'mockTranslator',
            capabilities: PROVIDER_CAPABILITIES,
            config: exposedConfig,
            async getCapacity(): Promise<number> {
                return internalConfig.capacity;
            },
            getRuntimeStatus() {
                return createTranslationProviderRuntimeStatus({
                    state: 'available',
                    code: 'ready',
                    message: '',
                    model: 'Mock Translator',
                    capacity: internalConfig.capacity,
                    capacityVerified: true,
                });
            },
            async translate(request: unknown = {}): Promise<string> {
                const requestCandidate = request as MockProviderRequestCandidate;
                const signal = requestCandidate.signal;
                const sourceText = requestCandidate.text;
                const admittedText = String(sourceText ?? '');
                await waitForMockDelay(internalConfig.delayMs, signal);
                return mockTranslateText(admittedText, internalConfig);
            },
        };
    }
    function nonNegativeInteger(value: unknown, fallback: number): number {
        if (value === undefined || value === null || value === '')
            return fallback;
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
    }
    function waitForMockDelay(delayMs: unknown, signal: unknown): Promise<void> {
        const waitMs = nonNegativeInteger(delayMs, DEFAULT_MOCK_DELAY_MS);
        const signalValue = signal as FalsySensitiveValue;
        const candidate = signal as AbortSignalCandidate;
        return new Promise((resolve, reject) => {
            let settled = false;
            let timerOwned = false;
            let timerHandle: ReturnType<typeof setTimeout> | undefined;
            let listenerOwned = false;
            let listenerAcquiring = false;
            let addAbortListener: AbortSignalCandidate['addEventListener'];
            let removeAbortListener: AbortSignalCandidate['removeEventListener'];
            const releaseTimer = (): void => {
                if (!timerOwned)
                    return;
                timerOwned = false;
                const ownedHandle = timerHandle;
                timerHandle = undefined;
                try {
                    clearTimeout(ownedHandle);
                }
                catch {
                }
            };
            const releaseListener = (): void => {
                if (!listenerOwned)
                    return;
                if (listenerAcquiring)
                    return;
                listenerOwned = false;
                if (typeof removeAbortListener !== 'function')
                    return;
                try {
                    Reflect.apply(removeAbortListener, candidate, ['abort', onAbort]);
                }
                catch {
                }
            };
            const releaseOwnedResources = (): void => {
                releaseTimer();
                releaseListener();
            };
            const settleSuccess = (): void => {
                if (settled)
                    return;
                settled = true;
                releaseOwnedResources();
                resolve();
            };
            const publishFailure = (error: unknown): void => {
                releaseOwnedResources();
                reject(error);
            };
            const settleFailure = (error: unknown): void => {
                if (settled)
                    return;
                settled = true;
                publishFailure(error);
            };
            const settleAbort = (): void => {
                if (settled)
                    return;
                settled = true;
                let abortError: unknown;
                try {
                    abortError = createAbortError(candidate.reason);
                }
                catch (error) {
                    abortError = error;
                }
                publishFailure(abortError);
            };
            const readAborted = (): boolean | null => {
                if (!signalValue)
                    return false;
                try {
                    return candidate.aborted === true;
                }
                catch (error) {
                    settleFailure(error);
                    return null;
                }
            };
            const onAbort = (): void => {
                settleAbort();
            };
            const initiallyAborted = readAborted();
            if (initiallyAborted === null)
                return;
            if (initiallyAborted) {
                settleAbort();
                return;
            }
            if (waitMs <= 0) {
                settleSuccess();
                return;
            }
            if (signalValue) {
                try {
                    addAbortListener = candidate.addEventListener;
                }
                catch (error) {
                    settleFailure(error);
                    return;
                }
                if (typeof addAbortListener === 'function') {
                    try {
                        removeAbortListener = candidate.removeEventListener;
                    }
                    catch (error) {
                        settleFailure(error);
                        return;
                    }
                    if (typeof removeAbortListener !== 'function') {
                        settleFailure(new TypeError('Abort listener registration requires a removal capability.'));
                        return;
                    }
                    listenerOwned = true;
                    listenerAcquiring = true;
                    try {
                        Reflect.apply(addAbortListener, candidate, ['abort', onAbort, { once: true }]);
                    }
                    catch (error) {
                        listenerAcquiring = false;
                        if (settled) {
                            releaseListener();
                            return;
                        }
                        settleFailure(error);
                        return;
                    }
                    listenerAcquiring = false;
                    if (settled) {
                        releaseListener();
                        return;
                    }
                }
                const abortedAfterListener = readAborted();
                if (abortedAfterListener === null)
                    return;
                if (abortedAfterListener) {
                    settleAbort();
                    return;
                }
            }
            try {
                const acquiredHandle = setTimeout(() => {
                    timerOwned = false;
                    timerHandle = undefined;
                    settleSuccess();
                }, waitMs);
                timerHandle = acquiredHandle;
                timerOwned = true;
            }
            catch (error) {
                settleFailure(error);
                return;
            }
            if (settled) {
                releaseOwnedResources();
                return;
            }
            const abortedAfterTimer = readAborted();
            if (abortedAfterTimer === null)
                return;
            if (abortedAfterTimer) {
                settleAbort();
            }
        });
    }
    function mockTranslateText(text: unknown, options: unknown = {}): string {
        const cfg = options && typeof options === 'object'
            ? (options as MockTranslationOptionsCandidate)
            : ({} as MockTranslationOptionsCandidate);
        if (cfg.useRandomizedStrings === true) {
            return mockTranslateTextRandomized(text, cfg.random);
        }
        return mockTranslateTextSequential(text);
    }
    function mockTranslateTextSequential(text: unknown): string {
        let cjkIndex = 0;
        let latinIndex = 0;
        let translated = '';
        for (const char of String(text ?? '')) {
            if (CJK_LETTER_PATTERN.test(char)) {
                translated += CJK_MARKERS[cjkIndex % CJK_MARKERS.length] as string;
                cjkIndex += 1;
            }
            else if (LATIN_LETTER_PATTERN.test(char)) {
                translated += LATIN_MARKERS[latinIndex % LATIN_MARKERS.length] as string;
                latinIndex += 1;
            }
            else {
                translated += char;
            }
        }
        return translated;
    }
    function mockTranslateTextRandomized(text: unknown, random: unknown): string {
        let translated = '';
        for (const char of String(text ?? '')) {
            if (CJK_LETTER_PATTERN.test(char)) {
                translated += randomHangulSyllable(random);
            }
            else if (LATIN_LETTER_PATTERN.test(char)) {
                translated += LATIN_RANDOM_MARKERS[randomIndex(random, LATIN_RANDOM_MARKERS.length)] as string;
            }
            else {
                translated += char;
            }
        }
        return translated;
    }
    function randomHangulSyllable(random: unknown): string {
        return CJK_MARKERS.charAt(randomIndex(random, CJK_MARKERS.length));
    }
    function randomIndex(random: unknown, maxExclusive: number): number {
        const source = typeof random === 'function' ? (random as () => unknown) : Math.random;
        const raw = Number(source());
        const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(raw, 0.999999999999)) : 0;
        return Math.floor(normalized * maxExclusive);
    }
    return {
        createMockTranslatorProvider,
        mockTranslateText,
        normalizeMockTranslatorConfig,
        waitForMockDelay,
    };
}
