import type { CompiledIgnoreTranslationRegexRuleSet, CompiledOverrideTranslationRegexRuleSet, IgnoredTranslationRegexOutcome, OverrideTranslationRegexOutcome, } from './regex-rules.js';
import type { CompletedTranslationAliasGroup, CompletedTranslationLookup, PreparedCompletedTranslationBatch, TranslationMapSnapshot, } from './cache.js';
import { preservesTranslationMarkers } from '../translation-text-codec.js';
type StringCoercionCandidate = string | number | boolean | bigint | symbol | null | undefined;
interface IgnoreTranslationRegexDescription {
    skip: boolean;
    reason: unknown;
    readonly checkedFirst: unknown;
    readonly regexMode: 'javascript-unicode';
    readonly regexTarget: 'trimmedTranslationSource';
    readonly ignoreRegexCount: number;
    readonly length: number;
    filter?: unknown;
    regex?: unknown;
    regexIndex?: unknown;
    regexFlags?: unknown;
    regexPattern?: unknown;
    matchedText?: unknown;
    matchIndex?: unknown;
}
interface OverrideTranslationRegexDescription {
    readonly skip: false;
    readonly reason: '';
    readonly checkedFirst: unknown;
    readonly regexMode: 'javascript-unicode';
    readonly regexTarget: 'trimmedTranslationSource';
    readonly overrideRegexCount: number;
    readonly length: number;
    matched?: true;
    filter?: unknown;
    source?: unknown;
    sourceHint?: unknown;
    regex?: unknown;
    regexIndex?: unknown;
    regexFlags?: unknown;
    regexPattern?: unknown;
    matchedText?: unknown;
    matchIndex?: unknown;
    translation?: unknown;
}
interface TranslationSkipDescription {
    skip: boolean;
    reason: string;
    readonly checkedFirst: unknown;
    readonly regexMode: 'javascript-unicode';
    readonly regexTarget: 'trimmedTranslationSource';
    readonly ignoreRegexCount: number;
    readonly length: number;
}
export type TranslationEligibilityDescription = OverrideTranslationRegexDescription | IgnoreTranslationRegexDescription | TranslationSkipDescription;
interface TranslationTelemetryCandidate {
    logTranslation(event: unknown, normalized: unknown, result: unknown, context: unknown): unknown;
}
interface TranslationDiskCandidate {
    readonly enabled: unknown;
    readonly appendRecord: unknown;
}
interface TranslationLoggerCandidate {
    error(message: unknown, error: unknown): unknown;
}
interface CompletedTranslationMapCandidate {
    has(key: unknown): unknown;
    get(key: unknown): unknown;
    lookup(key: unknown): CompletedTranslationLookup;
    delete(key: unknown): unknown;
    prepareAliasBatch(groups: readonly CompletedTranslationAliasGroup[], capacity: number | null): PreparedCompletedTranslationBatch;
    commitAliasBatch(prepared: unknown, intent?: unknown): unknown;
}
interface TranslationDiagnosticsCandidate {
    flush(): unknown;
}
interface ProviderCapabilitiesCandidate {
    readonly streaming: unknown;
}
interface TranslationManagerEligibilityScopeCandidate {
    readonly IGNORE_REGEX_SETTING: unknown;
    readonly OVERRIDE_REGEX_SETTING: unknown;
    readonly rejectCounterLike: unknown;
    readonly clampPriority: (value: unknown) => unknown;
    readonly defaultPriorityForHook: (hook: string) => unknown;
    readonly getPositiveSetting: (settings: unknown, names: readonly string[], fallback: unknown) => unknown;
    readonly normalizeCacheKey: (text: unknown) => unknown;
    readonly deriveCacheKeyAliases: (text: unknown) => readonly unknown[];
    readonly findIgnoredTranslationRegexMatch: (text: string, rules: CompiledIgnoreTranslationRegexRuleSet) => IgnoredTranslationRegexOutcome;
    readonly findOverrideTranslationRegexMatch: (text: string, rules: CompiledOverrideTranslationRegexRuleSet) => OverrideTranslationRegexOutcome;
    readonly telemetry: TranslationTelemetryCandidate;
    readonly disk: TranslationDiskCandidate;
    readonly logger: TranslationLoggerCandidate;
    readonly getCacheEntryLimit: () => unknown;
    readonly pruneMapToLimit: (snapshot: TranslationMapSnapshot, limit: number) => unknown;
    readonly ignoreTranslationRegexRules: CompiledIgnoreTranslationRegexRuleSet;
    readonly overrideTranslationRegexRules: CompiledOverrideTranslationRegexRuleSet;
    readonly requestTimeoutMs: unknown;
    readonly completed: CompletedTranslationMapCandidate;
    readonly providerCapabilities: ProviderCapabilitiesCandidate | null | undefined;
    readonly translationDiagnostics: TranslationDiagnosticsCandidate;
}
interface TranslationRequestSourceCandidate {
    readonly text?: StringCoercionCandidate;
    readonly input?: StringCoercionCandidate;
    readonly hook?: StringCoercionCandidate;
    readonly priority?: unknown;
    readonly stream?: unknown;
    readonly mode?: unknown;
    readonly recordId?: StringCoercionCandidate;
    readonly source?: StringCoercionCandidate;
    readonly signal?: unknown;
    readonly onDelta?: unknown;
    readonly onTranslatorExchange?: unknown;
    readonly timeoutMs?: unknown;
    readonly requestTimeoutMs?: unknown;
    readonly request_timeout_ms?: unknown;
    readonly metadata?: unknown;
}
interface NormalizedRequestCandidate {
    readonly recordId?: unknown;
    readonly hook?: unknown;
    readonly source?: unknown;
    readonly normalized?: unknown;
}
interface ProviderCommitAuthorityCandidate {
    readonly sourceKey: unknown;
    readonly cacheable: unknown;
}
interface EligibilitySourceProjection {
    readonly raw: string;
    readonly trimmed: string;
}
function requireRegexOutcome<Outcome extends IgnoredTranslationRegexOutcome | OverrideTranslationRegexOutcome>(outcome: Outcome): Exclude<Outcome, {
    readonly status: 'failed';
}> {
    if (outcome.status !== 'failed')
        return outcome as Exclude<Outcome, {
            readonly status: 'failed';
        }>;
    if (outcome.cause instanceof Error)
        throw outcome.cause;
    throw new Error(`Translation regex matching failed: ${outcome.reason}`);
}
export interface TranslationManagerEligibilityController {
    describeIgnoreTranslationRegex(text: unknown): IgnoreTranslationRegexDescription;
    describeOverrideTranslationRegex(text: unknown): OverrideTranslationRegexDescription;
    describeSkip(text: unknown): TranslationSkipDescription;
    describeEligibility(text: unknown): TranslationEligibilityDescription;
    shouldSkip(text: unknown): boolean;
    shouldIgnoreTranslation(text: unknown): boolean;
    lookupOverrideTranslationRegex(text: unknown): OverrideTranslationRegexDescription | null;
    logTranslationEvent(event: unknown, normalized: unknown, result?: unknown, context?: unknown): void;
    normalizeRequest(input: unknown, maybeOptions?: unknown): unknown;
    requestContext(request: unknown): unknown;
    storeCompletedTranslation(input: unknown, translated: unknown): void;
    storeCompletedTranslations(entries: unknown): number;
    forgetCompletedTranslation(input: unknown, translated?: unknown): boolean;
    lookupCompleted(normalized: unknown): unknown;
    finalizeProviderSuccess(authority: unknown, translated: unknown): void;
}
export interface TranslationManagerEligibilityModule {
    create(scope?: unknown): TranslationManagerEligibilityController;
}
const createTranslationManagerEligibilityController = function createController(scope: unknown = {}): TranslationManagerEligibilityController {
    const { IGNORE_REGEX_SETTING, OVERRIDE_REGEX_SETTING, rejectCounterLike, clampPriority, defaultPriorityForHook, getPositiveSetting, normalizeCacheKey, deriveCacheKeyAliases, findIgnoredTranslationRegexMatch, findOverrideTranslationRegexMatch, telemetry, disk, logger, getCacheEntryLimit, pruneMapToLimit, ignoreTranslationRegexRules, overrideTranslationRegexRules, requestTimeoutMs, completed, providerCapabilities, } = scope as TranslationManagerEligibilityScopeCandidate;
    function createEligibilitySourceProjection(text: unknown): EligibilitySourceProjection {
        const stringInput = (text ?? '') as StringCoercionCandidate;
        const raw = String(stringInput);
        return { raw, trimmed: raw.trim() };
    }
    function describeIgnoreTranslationRegexFromSource(source: EligibilitySourceProjection): IgnoreTranslationRegexDescription {
        const { trimmed } = source;
        const ignoredOutcome = requireRegexOutcome(findIgnoredTranslationRegexMatch(trimmed, ignoreTranslationRegexRules));
        const base: IgnoreTranslationRegexDescription = {
            skip: false,
            reason: '',
            checkedFirst: IGNORE_REGEX_SETTING,
            regexMode: 'javascript-unicode',
            regexTarget: 'trimmedTranslationSource',
            ignoreRegexCount: ignoreTranslationRegexRules.count,
            length: trimmed.length,
        };
        if (!trimmed || ignoredOutcome.status === 'unmatched')
            return base;
        const ignoredMatch = ignoredOutcome;
        const rule = ignoredMatch.rule;
        return Object.assign(base, {
            skip: true,
            reason: IGNORE_REGEX_SETTING,
            filter: IGNORE_REGEX_SETTING,
            regex: rule.display,
            regexIndex: rule.index,
            regexFlags: rule.flags,
            regexPattern: rule.pattern,
            matchedText: ignoredMatch.matchText,
            matchIndex: ignoredMatch.matchIndex,
        });
    }
    function describeIgnoreTranslationRegex(text: unknown): IgnoreTranslationRegexDescription {
        return describeIgnoreTranslationRegexFromSource(createEligibilitySourceProjection(text));
    }
    function describeOverrideTranslationRegexFromSource(source: EligibilitySourceProjection): OverrideTranslationRegexDescription {
        const { trimmed } = source;
        const overrideOutcome = requireRegexOutcome(findOverrideTranslationRegexMatch(trimmed, overrideTranslationRegexRules));
        const base: OverrideTranslationRegexDescription = {
            skip: false,
            reason: '',
            checkedFirst: OVERRIDE_REGEX_SETTING,
            regexMode: 'javascript-unicode',
            regexTarget: 'trimmedTranslationSource',
            overrideRegexCount: overrideTranslationRegexRules.count,
            length: trimmed.length,
        };
        if (!trimmed || overrideOutcome.status === 'unmatched')
            return base;
        const overrideMatch = overrideOutcome;
        const rule = overrideMatch.rule;
        return Object.assign(base, {
            matched: true,
            filter: OVERRIDE_REGEX_SETTING,
            source: OVERRIDE_REGEX_SETTING,
            sourceHint: OVERRIDE_REGEX_SETTING,
            regex: rule.display,
            regexIndex: rule.index,
            regexFlags: rule.flags,
            regexPattern: rule.pattern,
            matchedText: overrideMatch.matchText,
            matchIndex: overrideMatch.matchIndex,
            translation: overrideMatch.translation,
        });
    }
    function describeOverrideTranslationRegex(text: unknown): OverrideTranslationRegexDescription {
        return describeOverrideTranslationRegexFromSource(createEligibilitySourceProjection(text));
    }
    function describeSkipFromSource(source: EligibilitySourceProjection): TranslationSkipDescription {
        const { raw, trimmed } = source;
        const base: TranslationSkipDescription = {
            skip: false,
            reason: '',
            checkedFirst: IGNORE_REGEX_SETTING,
            regexMode: 'javascript-unicode',
            regexTarget: 'trimmedTranslationSource',
            ignoreRegexCount: ignoreTranslationRegexRules.count,
            length: trimmed.length,
        };
        if (!raw)
            return Object.assign(base, { skip: true, reason: 'emptyInput' });
        if (!trimmed)
            return Object.assign(base, { skip: true, reason: 'emptyTrimmed' });
        if (rejectCounterLike === true && !/\p{Letter}/u.test(trimmed)) {
            return Object.assign(base, { skip: true, reason: 'counterLike' });
        }
        return base;
    }
    function describeSkip(text: unknown): TranslationSkipDescription {
        return describeSkipFromSource(createEligibilitySourceProjection(text));
    }
    function describeEligibility(text: unknown): TranslationEligibilityDescription {
        const sourceProjection = createEligibilitySourceProjection(text);
        const override = describeOverrideTranslationRegexFromSource(sourceProjection);
        if (override.matched)
            return override;
        const ignored = describeIgnoreTranslationRegexFromSource(sourceProjection);
        if (ignored.skip)
            return ignored;
        return describeSkipFromSource(sourceProjection);
    }
    function shouldSkip(text: unknown): boolean {
        return describeSkip(text).skip;
    }
    function shouldIgnoreTranslation(text: unknown): boolean {
        return describeIgnoreTranslationRegex(text).skip;
    }
    function lookupOverrideTranslationRegex(text: unknown): OverrideTranslationRegexDescription | null {
        const override = describeOverrideTranslationRegex(text);
        return override.matched ? override : null;
    }
    function logTranslationEvent(event: unknown, normalized: unknown, result: unknown = null, context: unknown = {}): void {
        telemetry.logTranslation(event, normalized, result, context);
    }
    function normalizeRequest(input: unknown, maybeOptions: unknown = {}): unknown {
        const objectInput = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
        const requestSource = (objectInput
            ? Object.assign(Object.create(null), input, (maybeOptions as boolean) ? maybeOptions : {})
            : Object.assign(Object.create(null), (maybeOptions as boolean) ? maybeOptions : {}, {
                text: input,
            })) as TranslationRequestSourceCandidate;
        const text = String(requestSource.text ?? requestSource.input ?? '');
        const normalized = normalizeCacheKey(text);
        const hook = requestSource.hook ? String(requestSource.hook) : '';
        const priority = requestSource.priority === undefined || requestSource.priority === null
            ? defaultPriorityForHook(hook)
            : clampPriority(requestSource.priority);
        const streamRequested = requestSource.stream === true || requestSource.mode === 'stream';
        return {
            text,
            normalized,
            hook,
            recordId: requestSource.recordId ? String(requestSource.recordId) : '',
            source: requestSource.source ? String(requestSource.source) : '',
            streamRequested,
            stream: streamRequested && !!providerCapabilities && providerCapabilities.streaming === true,
            priority,
            signal: requestSource.signal,
            onDelta: typeof requestSource.onDelta === 'function' ? requestSource.onDelta : null,
            onTranslatorExchange: typeof requestSource.onTranslatorExchange === 'function' ? requestSource.onTranslatorExchange : null,
            timeoutMs: getPositiveSetting({ translation: requestSource }, ['timeoutMs', 'requestTimeoutMs', 'request_timeout_ms'], requestTimeoutMs),
            metadata: requestSource.metadata && typeof requestSource.metadata === 'object' ? requestSource.metadata : {},
        };
    }
    function requestContext(request: unknown): unknown {
        const candidate = request as NormalizedRequestCandidate;
        let contextValue: unknown;
        return {
            recordId: ((contextValue = candidate.recordId) as boolean) ? contextValue : '',
            hook: ((contextValue = candidate.hook) as boolean) ? contextValue : '',
            source: ((contextValue = candidate.source) as boolean) ? contextValue : '',
            normalizedSource: ((contextValue = candidate.normalized) as boolean) ? contextValue : '',
        };
    }
    function prepareCompletedTranslationGroup(input: unknown, translated: unknown): CompletedTranslationAliasGroup | null {
        const aliases = deriveCacheKeyAliases(input);
        if (!aliases.length)
            return null;
        const normalizedTranslation = normalizeCacheKey(translated);
        if (!normalizedTranslation || aliases.some((alias) => normalizeCacheKey(alias) === normalizedTranslation))
            return null;
        const sourceKey = aliases[0];
        if (typeof sourceKey === 'string' &&
            typeof normalizedTranslation === 'string' &&
            !preservesTranslationMarkers(sourceKey, normalizedTranslation)) {
            return null;
        }
        return Object.freeze({ aliases: Object.freeze(Array.from(aliases)), value: translated });
    }
    function getCompletedCacheCapacity(): number | null {
        const configuredLimit = Number(getCacheEntryLimit());
        return Number.isFinite(configuredLimit) && configuredLimit > 0
            ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(configuredLimit)))
            : null;
    }
    function commitCompletedTranslationGroups(groups: readonly CompletedTranslationAliasGroup[]): boolean {
        if (!groups.length)
            return false;
        const capacity = getCompletedCacheCapacity();
        const preparedBatch = completed.prepareAliasBatch(groups, capacity);
        let evictionIntent: unknown = null;
        if (capacity !== null && preparedBatch.snapshot && preparedBatch.snapshot.size > capacity) {
            try {
                evictionIntent = pruneMapToLimit(preparedBatch.snapshot, capacity);
            }
            catch {
            }
        }
        completed.commitAliasBatch(preparedBatch, evictionIntent);
        scheduleCompletedCachePublish();
        return true;
    }
    function tryStoreCompletedTranslation(input: unknown, translated: unknown): boolean {
        const group = prepareCompletedTranslationGroup(input, translated);
        return group !== null && commitCompletedTranslationGroups([group]);
    }
    function storeCompletedTranslation(input: unknown, translated: unknown): void {
        tryStoreCompletedTranslation(input, translated);
    }
    function storeCompletedTranslations(entries: unknown): number {
        if (!Array.isArray(entries)) {
            throw new TypeError('[TranslationService] Completed translation hydration must be an array.');
        }
        const captured: (readonly [
            unknown,
            unknown
        ])[] = [];
        const entryCount = entries.length;
        for (let index = 0; index < entryCount; index += 1) {
            const row: unknown = entries[index];
            if (!Array.isArray(row) || row.length < 2) {
                throw new TypeError('[TranslationService] A completed translation row must be a key/value pair.');
            }
            captured.push(Object.freeze([row[0], row[1]]));
        }
        const groups: CompletedTranslationAliasGroup[] = [];
        for (const [input, translated] of captured) {
            const group = prepareCompletedTranslationGroup(input, translated);
            if (group !== null)
                groups.push(group);
        }
        if (!groups.length)
            return 0;
        commitCompletedTranslationGroups(groups);
        return groups.length;
    }
    function forgetCompletedTranslation(input: unknown, translated: unknown = ''): boolean {
        const aliases = deriveCacheKeyAliases(input);
        if (!aliases.length)
            return false;
        const expected = normalizeCacheKey(translated);
        let deleted = false;
        aliases.forEach((alias) => {
            const result = completed.lookup(alias);
            if (!result.found)
                return;
            if (expected && normalizeCacheKey(result.value) !== expected)
                return;
            completed.delete(alias);
            deleted = true;
        });
        if (deleted as boolean)
            scheduleCompletedCachePublish();
        return deleted;
    }
    function scheduleCompletedCachePublish(): void {
        try {
            (scope as TranslationManagerEligibilityScopeCandidate).translationDiagnostics.flush();
        }
        catch {
        }
    }
    function lookupCompleted(normalized: unknown): unknown {
        const aliases = deriveCacheKeyAliases(normalized);
        for (const alias of aliases) {
            const result = completed.lookup(alias);
            if (result.found) {
                const translated = result.value;
                const translatedKey = normalizeCacheKey(translated);
                if (typeof alias === 'string' &&
                    typeof translatedKey === 'string' &&
                    !preservesTranslationMarkers(alias, translatedKey)) {
                    forgetCompletedTranslation(alias, translated);
                    continue;
                }
                return translated;
            }
        }
        return null;
    }
    function finalizeProviderSuccess(authority: unknown, translated: unknown): void {
        const candidate = authority as ProviderCommitAuthorityCandidate;
        if (candidate.cacheable !== true)
            return;
        const key = candidate.sourceKey;
        if (!tryStoreCompletedTranslation(key, translated))
            return;
        appendCompletedTranslationToDisk(key, translated);
    }
    function appendCompletedTranslationToDisk(key: unknown, translated: unknown): void {
        try {
            if (!disk.enabled)
                return;
            const appendRecord = disk.appendRecord;
            if (typeof appendRecord !== 'function')
                return;
            const appendFunction = appendRecord as (key: unknown, value: unknown) => unknown;
            const appendResult: unknown = Reflect.apply(appendFunction, disk, [key, translated]);
            void Promise.resolve(appendResult).catch(reportDiskAppendFailure);
        }
        catch (error) {
            reportDiskAppendFailure(error);
        }
    }
    function reportDiskAppendFailure(error: unknown): void {
        try {
            logger.error('[TranslationService] Disk cache append failed.', error);
        }
        catch {
        }
    }
    return {
        describeIgnoreTranslationRegex,
        describeOverrideTranslationRegex,
        describeSkip,
        describeEligibility,
        shouldSkip,
        shouldIgnoreTranslation,
        lookupOverrideTranslationRegex,
        logTranslationEvent,
        normalizeRequest,
        requestContext,
        storeCompletedTranslation,
        storeCompletedTranslations,
        forgetCompletedTranslation,
        lookupCompleted,
        finalizeProviderSuccess,
    };
};
export function createTranslationManagerEligibilityModule(): TranslationManagerEligibilityModule {
    return { create: createTranslationManagerEligibilityController };
}
