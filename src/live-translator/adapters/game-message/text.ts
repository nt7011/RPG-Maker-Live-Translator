type RuntimeCallback = (...args: unknown[]) => unknown;
const applyTextRecoveryFunction = Reflect.apply;
const freezeTextRecoveryIntrinsic = Object.freeze;
const isFrozenTextRecoveryIntrinsic = Object.isFrozen;
const stringTextRecoveryIntrinsic = String;
const TextRecoveryTypeErrorIntrinsic = TypeError;
export interface GameMessageBreakInfo {
    readonly originAware: true;
    readonly hadHardMessageBreaks: boolean;
    readonly hardBreakCount: number;
}
export interface GameMessageTextPayload {
    readonly resolved: string;
    readonly visible: unknown;
    readonly codecState: unknown;
    readonly translationSource: unknown;
    readonly normalizedTranslationSource: unknown;
    readonly messageBreakInfo: unknown;
    readonly messageOrigin: unknown;
    readonly rawText: string;
    readonly nativeConverted?: boolean;
    readonly nativeConversionReceipt?: unknown;
}
export interface ResolvedGameMessageText {
    readonly text: unknown;
    readonly messageBreakInfo: GameMessageBreakInfo | null;
    readonly rawText: string;
    readonly messageOrigin: unknown;
    readonly nativeConverted?: boolean;
    readonly nativeConversionReceipt?: unknown;
}
interface ConfigCandidate {
    readonly hacks?: unknown;
    readonly targets?: unknown;
}
interface HacksSettingsCandidate {
    readonly originAwareLineBreaks?: unknown;
}
interface TargetsSettingsCandidate {
    readonly enableForesight?: unknown;
}
interface PayloadOptionsCandidate {
    readonly messageBreakInfo?: unknown;
    readonly messageOrigin?: unknown;
    readonly nativeConverted?: unknown;
    readonly nativeConversionReceipt?: unknown;
    readonly rawText?: unknown;
}
interface TextSourceCandidate {
    readonly visibleText?: unknown;
    readonly codecState?: unknown;
    readonly translationSource?: unknown;
    readonly normalizedSource?: unknown;
}
interface TextControllerScopeCandidate {
    readonly RAW_BREAK_PATTERN: RegExp;
    readonly createTextSource: RuntimeCallback;
    readonly nativeConversionReceipts?: {
        inspect(windowInstance: unknown): unknown;
    };
    readonly getGameMessageForWindow: RuntimeCallback;
    readonly getVerifiedMessageOrigin: RuntimeCallback;
    readonly readMessageOriginText: (gameMessage: unknown) => string;
    readonly warn: RuntimeCallback;
    readonly originAwareLineBreaks?: unknown;
}
export function resolveGameMessageOriginAwareLineBreaks(config: unknown): boolean {
    const configSource = config as ConfigCandidate;
    const hacks = config && typeof configSource.hacks === 'object' ? configSource.hacks : null;
    const raw = hacks && (hacks as HacksSettingsCandidate).originAwareLineBreaks;
    return raw === true || (typeof raw === 'string' && raw.trim().toLowerCase() === 'true');
}
export function resolveGameMessageForesightEnabled(config: unknown): boolean {
    if (!config || typeof config !== 'object')
        return true;
    const configSource = config as ConfigCandidate;
    const targets = typeof configSource.targets === 'object' ? configSource.targets : null;
    return !(targets && (targets as TargetsSettingsCandidate).enableForesight === false);
}
interface PreparedTextSource {
    readonly visible: string;
    readonly codecState: unknown;
    readonly translationSource: unknown;
    readonly normalizedTranslationSource: unknown;
}
type TextSourceOutcome = {
    readonly status: 'prepared';
    readonly source: PreparedTextSource;
} | {
    readonly status: 'empty';
} | {
    readonly status: 'failed';
    readonly error: unknown;
};
interface PayloadOptionSnapshot {
    readonly present: boolean;
    readonly value: unknown;
}
function isTextRecoveryRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function applyTextRecoveryCallback(callback: RuntimeCallback, receiver: unknown, argumentsList: readonly unknown[]): unknown {
    return applyTextRecoveryFunction(callback, receiver, argumentsList);
}
function captureTextRecoveryString(value: unknown, defaultValue = ''): string {
    if (typeof value === 'string')
        return value;
    if (value === null || value === undefined)
        return '';
    try {
        const converted: unknown = applyTextRecoveryFunction(stringTextRecoveryIntrinsic, undefined, [value]);
        return typeof converted === 'string' ? converted : defaultValue;
    }
    catch {
        return defaultValue;
    }
}
function freezeTextRecoveryValue<Value extends object>(value: Value): Readonly<Value> {
    const frozen = applyTextRecoveryFunction(freezeTextRecoveryIntrinsic, Object, [value]);
    const attested = applyTextRecoveryFunction(isFrozenTextRecoveryIntrinsic, Object, [value]);
    if (frozen !== value || !attested) {
        throw new TextRecoveryTypeErrorIntrinsic('Text recovery could not freeze its exact owned value.');
    }
    return value;
}
export interface GameMessageTextController {
    readonly resolveGameMessageOriginAwareLineBreaks: (config: unknown) => boolean;
    readonly resolveEnableForesight: (config: unknown) => boolean;
    readonly createEscapeAwarePayload: (rawText: unknown, contextName?: unknown, options?: unknown) => GameMessageTextPayload | null;
    readonly getResolvedTextForWindow: (windowInstance: unknown) => ResolvedGameMessageText;
}
export interface GameMessageTextModule {
    create(scope?: unknown): GameMessageTextController;
}
export function createGameMessageTextModule(): GameMessageTextModule {
    function createController(scope: unknown = {}): GameMessageTextController {
        const source = scope as TextControllerScopeCandidate;
        const { RAW_BREAK_PATTERN, createTextSource } = source;
        const { nativeConversionReceipts } = source;
        const { getGameMessageForWindow, getVerifiedMessageOrigin, readMessageOriginText, warn } = source;
        if (!nativeConversionReceipts || typeof nativeConversionReceipts.inspect !== 'function') {
            throw new TypeError('Game message text requires the native conversion receipt authority.');
        }
        const receiptAuthority = nativeConversionReceipts;
        function reportTextRecoveryWarning(message: string, error: unknown): void {
            if (typeof warn !== 'function')
                return;
            try {
                applyTextRecoveryCallback(warn, undefined, [message, error]);
            }
            catch {
            }
        }
        function projectTextSource(candidate: unknown): TextSourceOutcome {
            if (!isTextRecoveryRecord(candidate)) {
                return {
                    status: 'failed',
                    error: new TextRecoveryTypeErrorIntrinsic('Text source creation did not return an object.'),
                };
            }
            try {
                const prepared = candidate as TextSourceCandidate;
                const visible = prepared.visibleText;
                const codecState = prepared.codecState;
                const translationSource = prepared.translationSource;
                const normalizedTranslationSource = prepared.normalizedSource;
                if (typeof visible !== 'string') {
                    return {
                        status: 'failed',
                        error: new TextRecoveryTypeErrorIntrinsic('Text source visibleText is not a string.'),
                    };
                }
                if (!visible)
                    return { status: 'empty' };
                return {
                    status: 'prepared',
                    source: {
                        visible,
                        codecState,
                        translationSource,
                        normalizedTranslationSource,
                    },
                };
            }
            catch (error) {
                return { status: 'failed', error };
            }
        }
        function prepareNativeTextSource(resolved: string): TextSourceOutcome {
            if (typeof createTextSource !== 'function') {
                return {
                    status: 'failed',
                    error: new TextRecoveryTypeErrorIntrinsic('createTextSource is unavailable.'),
                };
            }
            try {
                const candidate = applyTextRecoveryCallback(createTextSource, undefined, [
                    resolved,
                    { surfaceType: 'message' },
                ]);
                return projectTextSource(candidate);
            }
            catch (error) {
                return { status: 'failed', error };
            }
        }
        function readPayloadOption(options: unknown, key: keyof PayloadOptionsCandidate): PayloadOptionSnapshot {
            if (!isTextRecoveryRecord(options))
                return { present: false, value: undefined };
            try {
                const value = (options as PayloadOptionsCandidate)[key];
                return { present: value !== undefined, value };
            }
            catch {
                return { present: false, value: undefined };
            }
        }
        function createEscapeAwarePayload(rawText: unknown, contextName: unknown = 'message', options: unknown = {}): GameMessageTextPayload | null {
            const resolved = captureTextRecoveryString(rawText);
            const rawTextOption = readPayloadOption(options, 'rawText');
            const authoredText = rawTextOption.present
                ? captureTextRecoveryString(rawTextOption.value, resolved)
                : resolved;
            const messageBreakInfoOption = readPayloadOption(options, 'messageBreakInfo');
            const messageOriginOption = readPayloadOption(options, 'messageOrigin');
            const nativeConvertedOption = readPayloadOption(options, 'nativeConverted');
            const nativeConversionReceiptOption = readPayloadOption(options, 'nativeConversionReceipt');
            const context = captureTextRecoveryString(contextName, 'message') || 'message';
            const nativeSource = prepareNativeTextSource(resolved);
            if (nativeSource.status === 'empty')
                return null;
            if (nativeSource.status === 'failed') {
                reportTextRecoveryWarning(`[GameMessage ${context}] createTextSource failed; translation source unavailable.`, nativeSource.error);
                return null;
            }
            const preparedSource = nativeSource.source;
            return freezeTextRecoveryValue({
                resolved,
                visible: preparedSource.visible,
                codecState: preparedSource.codecState,
                translationSource: preparedSource.translationSource,
                normalizedTranslationSource: preparedSource.normalizedTranslationSource,
                messageBreakInfo: messageBreakInfoOption.present ? messageBreakInfoOption.value : null,
                messageOrigin: messageOriginOption.present ? messageOriginOption.value : null,
                rawText: authoredText,
                ...(nativeConvertedOption.present ? { nativeConverted: nativeConvertedOption.value === true } : {}),
                ...(nativeConversionReceiptOption.present
                    ? { nativeConversionReceipt: nativeConversionReceiptOption.value }
                    : {}),
            });
        }
        function readRawBreakInfo(rawText: string): GameMessageBreakInfo | null {
            try {
                const matches = rawText.match(RAW_BREAK_PATTERN) ?? [];
                return {
                    originAware: true,
                    hadHardMessageBreaks: matches.length > 0,
                    hardBreakCount: matches.length,
                };
            }
            catch {
                return null;
            }
        }
        function getResolvedTextForWindow(windowInstance: unknown): ResolvedGameMessageText {
            let gameMessage: unknown = null;
            try {
                gameMessage = applyTextRecoveryCallback(getGameMessageForWindow, undefined, [windowInstance]);
            }
            catch (error) {
                reportTextRecoveryWarning('[GameMessage] Message lookup failed; using empty authored text.', error);
            }
            let messageOrigin: unknown = null;
            try {
                messageOrigin = applyTextRecoveryCallback(getVerifiedMessageOrigin, undefined, [windowInstance]);
            }
            catch (error) {
                reportTextRecoveryWarning('[GameMessage] Message-origin lookup failed.', error);
            }
            let rawAll = '';
            try {
                const rawCandidate = applyTextRecoveryCallback(readMessageOriginText, undefined, [gameMessage]);
                rawAll = captureTextRecoveryString(rawCandidate);
            }
            catch (error) {
                reportTextRecoveryWarning('[GameMessage] Authored message lookup failed; using empty authored text.', error);
            }
            let originAware = false;
            try {
                originAware = source.originAwareLineBreaks === true;
            }
            catch (error) {
                reportTextRecoveryWarning('[GameMessage] Origin-aware setting lookup failed; using authored text.', error);
            }
            let nativeConversionReceipt: unknown = null;
            try {
                nativeConversionReceipt = receiptAuthority.inspect(windowInstance);
            }
            catch (error) {
                reportTextRecoveryWarning('[GameMessage] Native conversion receipt lookup failed.', error);
            }
            if (!isTextRecoveryRecord(nativeConversionReceipt)) {
                return {
                    text: rawAll,
                    messageBreakInfo: originAware ? readRawBreakInfo(rawAll) : null,
                    rawText: rawAll,
                    messageOrigin,
                };
            }
            let receiptOutput: unknown;
            try {
                receiptOutput = nativeConversionReceipt['output'];
            }
            catch {
                return {
                    text: rawAll,
                    messageBreakInfo: originAware ? readRawBreakInfo(rawAll) : null,
                    rawText: rawAll,
                    messageOrigin,
                };
            }
            if (typeof receiptOutput === 'string') {
                return {
                    text: receiptOutput,
                    messageBreakInfo: originAware ? readRawBreakInfo(rawAll) : null,
                    rawText: rawAll,
                    messageOrigin,
                    nativeConverted: true,
                    nativeConversionReceipt,
                };
            }
            return {
                text: rawAll,
                messageBreakInfo: originAware ? readRawBreakInfo(rawAll) : null,
                rawText: rawAll,
                messageOrigin,
            };
        }
        return {
            resolveGameMessageOriginAwareLineBreaks,
            resolveEnableForesight: resolveGameMessageForesightEnabled,
            createEscapeAwarePayload,
            getResolvedTextForWindow,
        };
    }
    return { create: createController };
}
