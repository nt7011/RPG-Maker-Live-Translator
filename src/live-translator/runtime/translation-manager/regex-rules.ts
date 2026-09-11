type RuntimeFunction = (...args: unknown[]) => unknown;
type PropertyBag = Record<PropertyKey, unknown>;
interface TranslationRegexCommonCandidate {
    readonly noop: RuntimeFunction;
}
interface TranslationRegexConstantsCandidate {
    readonly IGNORE_REGEX_SETTING: unknown;
    readonly OVERRIDE_REGEX_SETTING: unknown;
}
interface TranslationRegexRuntimeCandidate {
    readonly RegExp: RegExpConstructor;
}
interface LoggerCandidate {
    readonly warn?: unknown;
}
interface IgnoreRuleConfigurationCandidate {
    readonly pattern?: unknown;
    readonly flags?: unknown;
}
interface OverrideRuleConfigurationCandidate extends IgnoreRuleConfigurationCandidate {
    readonly replacement?: unknown;
}
export type TranslationRegexRuleKind = 'ignore' | 'override';
export interface TranslationRegexRuleDescriptor {
    readonly index: number;
    readonly pattern: string;
    readonly flags: string;
    readonly display: string;
}
export interface CompiledIgnoreTranslationRegexRuleSet {
    readonly kind: 'ignore';
    readonly count: number;
}
export interface CompiledOverrideTranslationRegexRuleSet {
    readonly kind: 'override';
    readonly count: number;
}
interface OwnedTranslationRegexRule {
    readonly descriptor: TranslationRegexRuleDescriptor;
    readonly regex: RegExp;
    readonly replacement: string | null;
}
interface OwnedTranslationRegexRuleSet {
    readonly kind: TranslationRegexRuleKind;
    readonly rules: readonly OwnedTranslationRegexRule[];
}
interface TranslationRegexMatchSnapshot {
    readonly matchText: string;
    readonly matchIndex: number;
    readonly captures: readonly (string | undefined)[];
    readonly namedCaptures: ReadonlyMap<string, string | undefined> | null;
}
export type TranslationRegexFailureReason = 'invalid-target' | 'foreign-rule-set' | 'rule-execution-failed' | 'cursor-restoration-failed' | 'replacement-expansion-failed';
export interface TranslationRegexFailedOutcome {
    readonly status: 'failed';
    readonly reason: TranslationRegexFailureReason;
    readonly rule: TranslationRegexRuleDescriptor | null;
    readonly cause: unknown;
    readonly priorFailure: {
        readonly reason: 'rule-execution-failed';
        readonly cause: unknown;
    } | null;
}
export interface TranslationRegexUnmatchedOutcome {
    readonly status: 'unmatched';
}
export interface IgnoredTranslationRegexMatchedOutcome {
    readonly status: 'matched';
    readonly rule: TranslationRegexRuleDescriptor;
    readonly matchText: string;
    readonly matchIndex: number;
}
export interface OverrideTranslationRegexMatchedOutcome extends IgnoredTranslationRegexMatchedOutcome {
    readonly translation: string;
}
export type IgnoredTranslationRegexOutcome = TranslationRegexFailedOutcome | TranslationRegexUnmatchedOutcome | IgnoredTranslationRegexMatchedOutcome;
export type OverrideTranslationRegexOutcome = TranslationRegexFailedOutcome | TranslationRegexUnmatchedOutcome | OverrideTranslationRegexMatchedOutcome;
export interface TranslationManagerRegexRulesModule {
    compileIgnoreTranslationRegexRules(settings: unknown, logger?: unknown): CompiledIgnoreTranslationRegexRuleSet;
    compileOverrideTranslationRegexRules(settings: unknown, logger?: unknown): CompiledOverrideTranslationRegexRuleSet;
    findIgnoredTranslationRegexMatch(text: unknown, rules: unknown): IgnoredTranslationRegexOutcome;
    findOverrideTranslationRegexMatch(text: unknown, rules: unknown): OverrideTranslationRegexOutcome;
}
type NormalizedFlags = {
    readonly accepted: true;
    readonly flags: string;
} | {
    readonly accepted: false;
};
const CANONICAL_FLAG_ORDER = ['i', 'm', 's', 'u'] as const;
const SUPPORTED_FLAGS: ReadonlySet<string> = new Set(CANONICAL_FLAG_ORDER);
function isObjectRecord(value: unknown): value is PropertyBag {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function normalizeFlags(rawFlags: string): NormalizedFlags {
    const seen = new Set<string>();
    for (const flag of rawFlags) {
        if (!SUPPORTED_FLAGS.has(flag) || seen.has(flag))
            return { accepted: false };
        seen.add(flag);
    }
    seen.add('u');
    return {
        accepted: true,
        flags: CANONICAL_FLAG_ORDER.filter((flag) => seen.has(flag)).join(''),
    };
}
function createConfigurationErrorMessage(error: unknown): string {
    try {
        if (error && typeof error === 'object') {
            const message = (error as {
                readonly message?: unknown;
            }).message;
            if (typeof message === 'string' && message)
                return message;
            return Object.prototype.toString.call(error);
        }
        if (typeof error === 'function')
            return `[function ${error.name || 'anonymous'}]`;
        if (typeof error === 'string')
            return error;
        if (typeof error === 'number' || typeof error === 'bigint' || typeof error === 'boolean') {
            return String(error);
        }
        if (typeof error === 'symbol')
            return error.description ? `Symbol(${error.description})` : 'Symbol()';
        return 'invalid regular expression';
    }
    catch {
        return 'invalid regular expression';
    }
}
export function createTranslationManagerRegexRulesModule(common: unknown, constants: unknown, runtimeScope: unknown): TranslationManagerRegexRulesModule {
    const { noop } = common as TranslationRegexCommonCandidate;
    const { IGNORE_REGEX_SETTING, OVERRIDE_REGEX_SETTING } = constants as TranslationRegexConstantsCandidate;
    const { RegExp: RuntimeRegExp } = runtimeScope as TranslationRegexRuntimeCandidate;
    const nativeExec = RuntimeRegExp.prototype.exec;
    const ruleSetStates = new WeakMap<object, OwnedTranslationRegexRuleSet>();
    const unmatchedOutcome: TranslationRegexUnmatchedOutcome = Object.freeze({ status: 'unmatched' });
    function bindWarn(logger: unknown): RuntimeFunction {
        if (!logger || (typeof logger !== 'object' && typeof logger !== 'function'))
            return noop;
        const warn = (logger as LoggerCandidate).warn;
        return typeof warn === 'function' ? (warn as RuntimeFunction).bind(logger) : noop;
    }
    function snapshotRuleList(rawRules: unknown, setting: unknown, warn: RuntimeFunction): unknown[] | null {
        const settingPath = `manipulation.${setting as string}`;
        if (rawRules === undefined || rawRules === null)
            return [];
        let isRuleArray: boolean;
        try {
            isRuleArray = Array.isArray(rawRules);
        }
        catch (error) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}" could not be inspected: ${createConfigurationErrorMessage(error)}`);
            return null;
        }
        if (!isRuleArray) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}" should be an array of structured regex rules.`);
            return null;
        }
        try {
            return Reflect.apply(Array.prototype.slice, rawRules, []) as unknown[];
        }
        catch (error) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}" could not be read: ${createConfigurationErrorMessage(error)}`);
            return null;
        }
    }
    function createRuleSet(kind: 'ignore', rules: readonly OwnedTranslationRegexRule[]): CompiledIgnoreTranslationRegexRuleSet;
    function createRuleSet(kind: 'override', rules: readonly OwnedTranslationRegexRule[]): CompiledOverrideTranslationRegexRuleSet;
    function createRuleSet(kind: TranslationRegexRuleKind, rules: readonly OwnedTranslationRegexRule[]): CompiledIgnoreTranslationRegexRuleSet | CompiledOverrideTranslationRegexRuleSet {
        const ownedRules = Object.freeze(rules.slice());
        const handle = Object.freeze({ kind, count: ownedRules.length });
        ruleSetStates.set(handle, Object.freeze({ kind, rules: ownedRules }));
        return handle;
    }
    function createOwnedRule(index: number, pattern: string, rawFlags: string, replacement: string | null, setting: unknown, warn: RuntimeFunction): OwnedTranslationRegexRule | null {
        const settingPath = `manipulation.${setting as string}`;
        if (!pattern) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}].pattern" is empty and was ignored.`);
            return null;
        }
        const normalizedFlags = normalizeFlags(rawFlags);
        if (!normalizedFlags.accepted) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}].flags" should contain each of i, m, s, or u at most once; Unicode mode is always enabled.`);
            return null;
        }
        try {
            const regex = new RuntimeRegExp(pattern, normalizedFlags.flags);
            const descriptor = Object.freeze({
                index,
                pattern,
                flags: regex.flags,
                display: `/${regex.source}/${regex.flags}`,
            });
            return Object.freeze({ descriptor, regex, replacement });
        }
        catch (error) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}].pattern" is not a valid JavaScript regex: ${createConfigurationErrorMessage(error)}`);
            return null;
        }
    }
    function compileIgnoreTranslationRegexRules(settings: unknown, logger: unknown = {}): CompiledIgnoreTranslationRegexRuleSet {
        const warn = bindWarn(logger);
        const settingPath = `manipulation.${IGNORE_REGEX_SETTING as string}`;
        let rawRules: unknown;
        try {
            rawRules = isObjectRecord(settings) ? settings[IGNORE_REGEX_SETTING as PropertyKey] : undefined;
        }
        catch (error) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}" could not be read: ${createConfigurationErrorMessage(error)}`);
            return createRuleSet('ignore', []);
        }
        const candidates = snapshotRuleList(rawRules, IGNORE_REGEX_SETTING, warn);
        if (!candidates)
            return createRuleSet('ignore', []);
        const rules: OwnedTranslationRegexRule[] = [];
        candidates.forEach((rawRule, index) => {
            let isRuleRecord: boolean;
            try {
                isRuleRecord = isObjectRecord(rawRule);
            }
            catch (error) {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}]" could not be inspected: ${createConfigurationErrorMessage(error)}`);
                return;
            }
            if (!isRuleRecord) {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}]" should be an object with pattern and flags strings.`);
                return;
            }
            let pattern: unknown;
            let flags: unknown;
            try {
                pattern = (rawRule as IgnoreRuleConfigurationCandidate).pattern;
                flags = (rawRule as IgnoreRuleConfigurationCandidate).flags;
            }
            catch (error) {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}]" could not be read: ${createConfigurationErrorMessage(error)}`);
                return;
            }
            if (typeof pattern !== 'string' || typeof flags !== 'string') {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}]" should contain pattern and flags strings.`);
                return;
            }
            const rule = createOwnedRule(index, pattern, flags, null, IGNORE_REGEX_SETTING, warn);
            if (rule)
                rules.push(rule);
        });
        return createRuleSet('ignore', rules);
    }
    function compileOverrideTranslationRegexRules(settings: unknown, logger: unknown = {}): CompiledOverrideTranslationRegexRuleSet {
        const warn = bindWarn(logger);
        const settingPath = `manipulation.${OVERRIDE_REGEX_SETTING as string}`;
        let rawRules: unknown;
        try {
            rawRules = isObjectRecord(settings) ? settings[OVERRIDE_REGEX_SETTING as PropertyKey] : undefined;
        }
        catch (error) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}" could not be read: ${createConfigurationErrorMessage(error)}`);
            return createRuleSet('override', []);
        }
        const candidates = snapshotRuleList(rawRules, OVERRIDE_REGEX_SETTING, warn);
        if (!candidates)
            return createRuleSet('override', []);
        const rules: OwnedTranslationRegexRule[] = [];
        candidates.forEach((rawRule, index) => {
            let isRuleRecord: boolean;
            try {
                isRuleRecord = isObjectRecord(rawRule);
            }
            catch (error) {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}]" could not be inspected: ${createConfigurationErrorMessage(error)}`);
                return;
            }
            if (!isRuleRecord) {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}]" should be an object with pattern, flags, and replacement strings.`);
                return;
            }
            let pattern: unknown;
            let flags: unknown;
            let replacement: unknown;
            try {
                pattern = (rawRule as OverrideRuleConfigurationCandidate).pattern;
                flags = (rawRule as OverrideRuleConfigurationCandidate).flags;
                replacement = (rawRule as OverrideRuleConfigurationCandidate).replacement;
            }
            catch (error) {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}]" could not be read: ${createConfigurationErrorMessage(error)}`);
                return;
            }
            if (typeof pattern !== 'string' || typeof flags !== 'string' || typeof replacement !== 'string') {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${String(index)}]" should contain pattern, flags, and replacement strings.`);
                return;
            }
            const rule = createOwnedRule(index, pattern, flags, replacement, OVERRIDE_REGEX_SETTING, warn);
            if (rule)
                rules.push(rule);
        });
        return createRuleSet('override', rules);
    }
    function createFailedOutcome(reason: TranslationRegexFailureReason, rule: TranslationRegexRuleDescriptor | null, cause: unknown, priorFailure: {
        readonly reason: 'rule-execution-failed';
        readonly cause: unknown;
    } | null = null): TranslationRegexFailedOutcome {
        return Object.freeze({ status: 'failed', reason, rule, cause, priorFailure });
    }
    function snapshotMatch(match: RegExpExecArray, target: string): TranslationRegexMatchSnapshot {
        const matchText = match[0];
        const matchIndex = match.index;
        const matchLength = match.length;
        const groups: unknown = match.groups;
        if (typeof matchText !== 'string' ||
            !Number.isInteger(matchIndex) ||
            matchIndex < 0 ||
            matchIndex + matchText.length > target.length ||
            target.slice(matchIndex, matchIndex + matchText.length) !== matchText ||
            !Number.isInteger(matchLength) ||
            matchLength < 1) {
            throw new TypeError('RegExp execution returned invalid match metadata.');
        }
        const captures: (string | undefined)[] = [];
        for (let index = 1; index < matchLength; index += 1) {
            const capture = match[index];
            if (capture !== undefined && typeof capture !== 'string') {
                throw new TypeError('RegExp execution returned a non-string capture.');
            }
            captures.push(capture);
        }
        let namedCaptures: ReadonlyMap<string, string | undefined> | null = null;
        if (groups !== undefined) {
            if (!groups || typeof groups !== 'object') {
                throw new TypeError('RegExp execution returned invalid named captures.');
            }
            const ownedNamedCaptures = new Map<string, string | undefined>();
            const groupValues = groups as PropertyBag;
            Object.keys(groupValues).forEach((name) => {
                const capture = groupValues[name];
                if (capture !== undefined && typeof capture !== 'string') {
                    throw new TypeError('RegExp execution returned a non-string named capture.');
                }
                ownedNamedCaptures.set(name, capture);
            });
            namedCaptures = ownedNamedCaptures;
        }
        return {
            matchText,
            matchIndex,
            captures: Object.freeze(captures),
            namedCaptures,
        };
    }
    function executeRule(target: string, rule: OwnedTranslationRegexRule): TranslationRegexMatchSnapshot | TranslationRegexFailedOutcome | null {
        const { regex, descriptor } = rule;
        let savedLastIndex = 0;
        let cursorCaptured = false;
        let snapshot: TranslationRegexMatchSnapshot | null = null;
        let executionFailed = false;
        let executionFailure: unknown;
        try {
            savedLastIndex = regex.lastIndex;
            cursorCaptured = true;
            regex.lastIndex = 0;
            const match = Reflect.apply(nativeExec, regex, [target]);
            if (match)
                snapshot = snapshotMatch(match, target);
        }
        catch (error) {
            executionFailed = true;
            executionFailure = error;
        }
        if (cursorCaptured) {
            try {
                regex.lastIndex = savedLastIndex;
            }
            catch (error) {
                return createFailedOutcome('cursor-restoration-failed', descriptor, error, executionFailed
                    ? Object.freeze({ reason: 'rule-execution-failed', cause: executionFailure })
                    : null);
            }
        }
        if (executionFailed) {
            return createFailedOutcome('rule-execution-failed', descriptor, executionFailure);
        }
        return snapshot;
    }
    function expandReplacementTemplate(target: string, match: TranslationRegexMatchSnapshot, replacement: string): string {
        const { matchText, matchIndex, captures, namedCaptures } = match;
        const prefix = target.slice(0, matchIndex);
        const suffix = target.slice(matchIndex + matchText.length);
        let expanded = '';
        for (let index = 0; index < replacement.length; index += 1) {
            const character = replacement.charAt(index);
            if (character !== '$' || index + 1 >= replacement.length) {
                expanded += character;
                continue;
            }
            const token = replacement.charAt(index + 1);
            if (token === '$') {
                expanded += '$';
                index += 1;
                continue;
            }
            if (token === '&') {
                expanded += matchText;
                index += 1;
                continue;
            }
            if (token === '`') {
                expanded += prefix;
                index += 1;
                continue;
            }
            if (token === "'") {
                expanded += suffix;
                index += 1;
                continue;
            }
            if (token === '<' && namedCaptures !== null) {
                const closeIndex = replacement.indexOf('>', index + 2);
                if (closeIndex !== -1) {
                    const name = replacement.slice(index + 2, closeIndex);
                    expanded += namedCaptures.get(name) ?? '';
                    index = closeIndex;
                    continue;
                }
            }
            if (token >= '0' && token <= '9') {
                const first = Number(token);
                let captureIndex = 0;
                let digitsConsumed = 0;
                const next = replacement.charAt(index + 2);
                if (next >= '0' && next <= '9') {
                    const twoDigit = first * 10 + Number(next);
                    if (twoDigit > 0 && twoDigit <= captures.length) {
                        captureIndex = twoDigit;
                        digitsConsumed = 2;
                    }
                }
                if (digitsConsumed === 0 && first > 0 && first <= captures.length) {
                    captureIndex = first;
                    digitsConsumed = 1;
                }
                if (digitsConsumed > 0) {
                    expanded += captures[captureIndex - 1] ?? '';
                    index += digitsConsumed;
                    continue;
                }
            }
            expanded += '$';
        }
        return `${prefix}${expanded}${suffix}`;
    }
    function getOwnedRuleSet(rules: unknown, expectedKind: TranslationRegexRuleKind): OwnedTranslationRegexRuleSet | null {
        if (!rules || (typeof rules !== 'object' && typeof rules !== 'function'))
            return null;
        const state = ruleSetStates.get(rules);
        return state?.kind === expectedKind ? state : null;
    }
    function findIgnoredTranslationRegexMatch(text: unknown, rules: unknown): IgnoredTranslationRegexOutcome {
        if (typeof text !== 'string') {
            return createFailedOutcome('invalid-target', null, new TypeError('Translation regex target must be a string.'));
        }
        const state = getOwnedRuleSet(rules, 'ignore');
        if (!state) {
            return createFailedOutcome('foreign-rule-set', null, new TypeError('Ignore regex matching requires a rule set compiled by this module instance.'));
        }
        for (const rule of state.rules) {
            const result = executeRule(text, rule);
            if (!result)
                continue;
            if ('status' in result)
                return result;
            return Object.freeze({
                status: 'matched',
                rule: rule.descriptor,
                matchText: result.matchText,
                matchIndex: result.matchIndex,
            });
        }
        return unmatchedOutcome;
    }
    function findOverrideTranslationRegexMatch(text: unknown, rules: unknown): OverrideTranslationRegexOutcome {
        if (typeof text !== 'string') {
            return createFailedOutcome('invalid-target', null, new TypeError('Translation regex target must be a string.'));
        }
        const state = getOwnedRuleSet(rules, 'override');
        if (!state) {
            return createFailedOutcome('foreign-rule-set', null, new TypeError('Override regex matching requires a rule set compiled by this module instance.'));
        }
        for (const rule of state.rules) {
            const result = executeRule(text, rule);
            if (!result)
                continue;
            if ('status' in result)
                return result;
            const replacement = rule.replacement;
            if (replacement === null) {
                return createFailedOutcome('replacement-expansion-failed', rule.descriptor, new TypeError('Override regex rule is missing its owned replacement template.'));
            }
            try {
                const translation = expandReplacementTemplate(text, result, replacement);
                return Object.freeze({
                    status: 'matched',
                    rule: rule.descriptor,
                    matchText: result.matchText,
                    matchIndex: result.matchIndex,
                    translation,
                });
            }
            catch (error) {
                return createFailedOutcome('replacement-expansion-failed', rule.descriptor, error);
            }
        }
        return unmatchedOutcome;
    }
    return {
        compileIgnoreTranslationRegexRules,
        compileOverrideTranslationRegexRules,
        findIgnoredTranslationRegexMatch,
        findOverrideTranslationRegexMatch,
    };
}
