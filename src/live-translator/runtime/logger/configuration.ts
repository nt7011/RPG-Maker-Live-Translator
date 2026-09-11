import { snapshotOwnDataArray } from '../own-array-snapshot.js';
type PropertyBag = Record<PropertyKey, unknown>;
interface LoggingSettingsCandidate extends PropertyBag {
    enabled?: unknown;
    level?: unknown;
    suppressExact?: unknown;
}
interface LoggerSettingsCandidate extends PropertyBag {
    logging?: unknown;
}
interface SuppressionEntryCandidate extends PropertyBag {
    equals?: unknown;
    regex?: unknown;
}
type SuppressionConfiguration = Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'configured';
    input: unknown;
}> | Readonly<{
    kind: 'invalid';
    issue: string;
}>;
type CompiledSuppressionMatcher = Readonly<{
    kind: 'equals';
    value: string;
}> | Readonly<{
    kind: 'regex';
    regex: RegExp;
}>;
export interface CompiledSuppressionPolicy {
    readonly issues: readonly string[];
    readonly shouldSuppress: (arguments_: readonly unknown[]) => boolean;
}
export interface CompiledLoggerConfiguration {
    readonly initialLevel: unknown;
    readonly loggingEnabled: boolean;
    readonly suppression: CompiledSuppressionPolicy;
}
export type CompileLoggerConfiguration = (settings: unknown) => CompiledLoggerConfiguration;
interface NormalizedLoggerConfiguration {
    readonly initialLevel: unknown;
    readonly loggingEnabled: boolean;
    readonly suppression: SuppressionConfiguration;
}
function normalizeObjectRecord(value: unknown): PropertyBag {
    return value !== null && typeof value === 'object' ? (value as PropertyBag) : {};
}
function captureMatcherField(source: PropertyBag, key: keyof SuppressionEntryCandidate): {
    present: boolean;
    valid: boolean;
    value: unknown;
} {
    try {
        const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
        if (!descriptor)
            return { present: false, valid: true, value: undefined };
        if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            return { present: true, valid: false, value: undefined };
        }
        return { present: true, valid: true, value: descriptor.value };
    }
    catch {
        return { present: true, valid: false, value: undefined };
    }
}
function normalizeLoggerConfiguration(settings: unknown): NormalizedLoggerConfiguration {
    const source = normalizeObjectRecord(settings);
    let clone: LoggerSettingsCandidate;
    try {
        clone = { ...source };
    }
    catch {
        return {
            initialLevel: undefined,
            loggingEnabled: true,
            suppression: { kind: 'invalid', issue: 'logger settings could not be captured' },
        };
    }
    if (!Object.prototype.hasOwnProperty.call(clone, 'logging')) {
        return {
            initialLevel: undefined,
            loggingEnabled: true,
            suppression: { kind: 'absent' },
        };
    }
    const loggingCandidate = clone.logging;
    if (!loggingCandidate || typeof loggingCandidate !== 'object') {
        return {
            initialLevel: undefined,
            loggingEnabled: true,
            suppression: { kind: 'invalid', issue: 'logging settings are malformed' },
        };
    }
    let loggingSettings: LoggingSettingsCandidate;
    try {
        loggingSettings = { ...loggingCandidate };
    }
    catch {
        return {
            initialLevel: undefined,
            loggingEnabled: true,
            suppression: { kind: 'invalid', issue: 'logging settings could not be captured' },
        };
    }
    const loggingEnabled = Object.prototype.hasOwnProperty.call(loggingSettings, 'enabled')
        ? !!loggingSettings.enabled
        : true;
    const suppression: SuppressionConfiguration = Object.prototype.hasOwnProperty.call(loggingSettings, 'suppressExact')
        ? { kind: 'configured', input: loggingSettings.suppressExact }
        : { kind: 'absent' };
    return {
        initialLevel: loggingSettings.level,
        loggingEnabled,
        suppression,
    };
}
export function createLoggerConfigurationCompiler(): CompileLoggerConfiguration {
    const RegExpConstructor = RegExp;
    const regExpSourceDescriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source');
    const regExpFlagsDescriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags');
    const regExpSourceGetter: unknown = regExpSourceDescriptor ? Reflect.get(regExpSourceDescriptor, 'get') : undefined;
    const regExpFlagsGetter: unknown = regExpFlagsDescriptor ? Reflect.get(regExpFlagsDescriptor, 'get') : undefined;
    const regExpTest: unknown = Reflect.get(RegExp.prototype, 'test');
    const jsonObject = JSON;
    const jsonStringify: unknown = Reflect.get(jsonObject, 'stringify');
    const stringFunction: unknown = String;
    function captureRegexPattern(value: unknown): {
        source: string;
        flags: string;
    } | null {
        if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
            return null;
        if (typeof regExpSourceGetter !== 'function' || typeof regExpFlagsGetter !== 'function')
            return null;
        try {
            const source: unknown = Reflect.apply(regExpSourceGetter, value, []);
            const flags: unknown = Reflect.apply(regExpFlagsGetter, value, []);
            return typeof source === 'string' && typeof flags === 'string' ? { source, flags } : null;
        }
        catch {
            return null;
        }
    }
    function compileRegexMatcher(value: unknown): CompiledSuppressionMatcher | null {
        try {
            const pattern = typeof value === 'string' ? { source: value, flags: '' } : captureRegexPattern(value);
            if (!pattern)
                return null;
            return {
                kind: 'regex',
                regex: new RegExpConstructor(pattern.source, pattern.flags),
            };
        }
        catch {
            return null;
        }
    }
    function renderArgument(argument: unknown): string | null {
        if (typeof argument === 'string')
            return argument;
        if (typeof jsonStringify !== 'function')
            return null;
        try {
            const serialized: unknown = Reflect.apply(jsonStringify, jsonObject, [argument]);
            if (typeof serialized === 'string')
                return serialized;
            if (serialized === undefined)
                return '';
            return null;
        }
        catch {
        }
        if (typeof stringFunction !== 'function')
            return null;
        try {
            const rendered: unknown = Reflect.apply(stringFunction, undefined, [argument]);
            return typeof rendered === 'string' ? rendered : null;
        }
        catch {
            return null;
        }
    }
    function renderArguments(arguments_: readonly unknown[]): string | null {
        let rendered = '';
        for (let index = 0; index < arguments_.length; index += 1) {
            const argument = renderArgument(arguments_[index]);
            if (argument === null)
                return null;
            if (index > 0)
                rendered += ' ';
            rendered += argument;
        }
        return rendered;
    }
    function testMatcher(matcher: CompiledSuppressionMatcher, rendered: string): boolean {
        if (matcher.kind === 'equals')
            return matcher.value === rendered;
        if (typeof regExpTest !== 'function')
            return true;
        matcher.regex.lastIndex = 0;
        try {
            const matched: unknown = Reflect.apply(regExpTest, matcher.regex, [rendered]);
            return !!matched;
        }
        finally {
            matcher.regex.lastIndex = 0;
        }
    }
    function compileSuppressionPolicy(configuration: SuppressionConfiguration): CompiledSuppressionPolicy {
        const issues: string[] = [];
        const matchers: CompiledSuppressionMatcher[] = [];
        let configurationFailed = false;
        switch (configuration.kind) {
            case 'absent':
                break;
            case 'invalid':
                issues.push(configuration.issue);
                configurationFailed = true;
                break;
            case 'configured': {
                const snapshot = snapshotOwnDataArray(configuration.input);
                if (!snapshot || !snapshot.complete || !snapshot.dataOnly) {
                    issues.push('suppression list must be a dense own-data array');
                    configurationFailed = true;
                }
                const entries = snapshot?.items ?? [];
                for (let index = 0; index < entries.length; index += 1) {
                    const entry = entries[index];
                    if (typeof entry === 'string') {
                        matchers.push({ kind: 'equals', value: entry });
                        continue;
                    }
                    const directRegex = compileRegexMatcher(entry);
                    if (directRegex) {
                        matchers.push(directRegex);
                        continue;
                    }
                    if (!entry || (typeof entry !== 'object' && typeof entry !== 'function')) {
                        issues.push(`suppression entry ${String(index)} has no supported matcher`);
                        configurationFailed = true;
                        continue;
                    }
                    const source = entry as PropertyBag;
                    const equals = captureMatcherField(source, 'equals');
                    const regex = captureMatcherField(source, 'regex');
                    let compiled = false;
                    let entryFailed = false;
                    if (equals.present) {
                        if (equals.valid && typeof equals.value === 'string') {
                            matchers.push({ kind: 'equals', value: equals.value });
                            compiled = true;
                        }
                        else {
                            entryFailed = true;
                        }
                    }
                    if (regex.present) {
                        const regexMatcher = regex.valid ? compileRegexMatcher(regex.value) : null;
                        if (regexMatcher) {
                            matchers.push(regexMatcher);
                            compiled = true;
                        }
                        else {
                            entryFailed = true;
                        }
                    }
                    if (!compiled || entryFailed) {
                        issues.push(`suppression entry ${String(index)} is malformed`);
                        configurationFailed = true;
                    }
                }
                break;
            }
        }
        function shouldSuppress(arguments_: readonly unknown[]): boolean {
            if (matchers.length === 0)
                return configurationFailed;
            const rendered = renderArguments(arguments_);
            if (rendered === null)
                return true;
            let evaluationFailed = false;
            let index = 0;
            while (index < matchers.length) {
                const matcher = matchers[index];
                index += 1;
                if (!matcher) {
                    evaluationFailed = true;
                    continue;
                }
                try {
                    if (testMatcher(matcher, rendered))
                        return true;
                }
                catch {
                    evaluationFailed = true;
                }
            }
            return evaluationFailed || configurationFailed;
        }
        return {
            issues,
            shouldSuppress,
        };
    }
    return function compileLoggerConfiguration(settings: unknown): CompiledLoggerConfiguration {
        const normalized = normalizeLoggerConfiguration(settings);
        return {
            initialLevel: normalized.initialLevel,
            loggingEnabled: normalized.loggingEnabled,
            suppression: compileSuppressionPolicy(normalized.suppression),
        };
    };
}
