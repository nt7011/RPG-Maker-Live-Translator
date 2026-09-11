import { TRANSLATION_MARKER } from '../translation-text-codec.js';
type StringCoercionCandidate = string | number | boolean | bigint | symbol | null | undefined;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
type RuntimeFunction = (...args: unknown[]) => unknown;
type PropertyBag = Record<PropertyKey, unknown>;
type TranslationMapEntry = readonly [
    unknown,
    unknown
];
interface TranslationManagerCacheCommonCandidate {
    readonly noop: RuntimeFunction;
}
interface TranslationManagerCacheConstantsCandidate {
    readonly SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING: unknown;
}
interface LoggerCandidate {
    readonly warn?: unknown;
}
interface PlaintextSubstitutionConfigurationCandidate {
    readonly from?: unknown;
    readonly to?: unknown;
}
interface RuleListCandidate {
    forEach(callback: (rawRule: unknown, index: string) => unknown): unknown;
}
interface SplitResultCandidate {
    join(separator: unknown): unknown;
}
interface SplittableCandidate {
    split(separator: unknown): SplitResultCandidate;
}
type IgnorePredicate = (key: unknown) => unknown;
type TranslationMapSubscriber = (snapshot: TranslationMapSnapshot) => unknown;
type TranslationMapValueProjector = (value: unknown, key: unknown) => unknown;
interface TranslationMapSourceCandidate {
    readonly size: unknown;
    readonly has: unknown;
    readonly get: unknown;
    readonly entries: unknown;
}
export interface CompiledPlaintextSubstitutionRule {
    index: unknown;
    from: unknown;
    to: unknown;
}
export interface TranslationMapSnapshot {
    readonly size: number;
    readonly entries: readonly TranslationMapEntry[];
}
export interface TranslationMapEvictionIntent {
    readonly keys: readonly unknown[];
}
export interface PreparedTranslationMapEviction {
    readonly snapshot: TranslationMapSnapshot;
}
export interface CompletedTranslationAliasGroup {
    readonly aliases: readonly unknown[];
    readonly value: unknown;
}
export interface CompletedTranslationLookup {
    readonly found: boolean;
    readonly value: unknown;
}
export interface PreparedCompletedTranslationBatch {
    readonly snapshot: TranslationMapSnapshot | null;
}
export interface ReadonlyTranslationMap {
    readonly size: number;
    has(key: unknown): boolean;
    get(key: unknown): unknown;
    snapshot(): TranslationMapSnapshot;
}
export interface ReadonlyCompletedTranslationMap extends ReadonlyTranslationMap {
    subscribe(listener: unknown): () => boolean;
}
export interface CompletedTranslationMap extends Iterable<TranslationMapEntry> {
    readonly size: number;
    readonly readonlyView: ReadonlyCompletedTranslationMap;
    has(key: unknown): boolean;
    get(key: unknown): unknown;
    lookup(key: unknown): CompletedTranslationLookup;
    set(key: unknown, value: unknown): CompletedTranslationMap;
    delete(key: unknown): boolean;
    clear(): void;
    entries(): IterableIterator<TranslationMapEntry>;
    keys(): IterableIterator<unknown>;
    values(): IterableIterator<unknown>;
    forEach(callback: unknown, thisArg?: unknown): void;
    snapshot(): TranslationMapSnapshot;
    prepareEviction(): PreparedTranslationMapEviction;
    applyEvictionIntent(prepared: unknown, intent: unknown): number;
    prepareAliasBatch(groups: readonly CompletedTranslationAliasGroup[], capacity: number | null): PreparedCompletedTranslationBatch;
    commitAliasBatch(prepared: unknown, intent?: unknown): boolean;
}
export interface TranslationManagerCacheModule {
    normalizeCacheKey(text: unknown): string;
    deriveCacheKeyAliases(text: unknown): string[];
    compileSubstitutePlaintextBeforeTranslationRules(settings: unknown, logger?: unknown): CompiledPlaintextSubstitutionRule[];
    applySubstitutePlaintextBeforeTranslationRules(text: unknown, rules: unknown): unknown;
    createReadonlyTranslationMap(source: unknown, projectValue?: unknown): ReadonlyTranslationMap;
    createCompletedTranslationMap(isIgnored: unknown): CompletedTranslationMap;
}
export function createTranslationManagerCacheModule(common: unknown, constants: unknown): TranslationManagerCacheModule {
    const { SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING } = constants as TranslationManagerCacheConstantsCandidate;
    const { noop } = common as TranslationManagerCacheCommonCandidate;
    function normalizeCacheKey(text: unknown): string {
        const stringText = (text ?? '') as StringCoercionCandidate;
        return String(stringText).trim();
    }
    function deriveCacheKeyAliases(text: unknown): string[] {
        const normalized = normalizeCacheKey(text);
        if (!normalized)
            return [];
        return [normalized];
    }
    function compileSubstitutePlaintextBeforeTranslationRules(settings: unknown, logger: unknown = {}): CompiledPlaintextSubstitutionRule[] {
        const loggerCandidate = logger as LoggerCandidate;
        const warn = typeof loggerCandidate.warn === 'function' ? (loggerCandidate.warn as RuntimeFunction).bind(logger) : noop;
        const rawRules = (settings as FalsySensitiveValue) &&
            (settings as PropertyBag)[SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING as PropertyKey];
        const settingPath = `manipulation.${SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING as string}`;
        if (rawRules === undefined || rawRules === null || rawRules === '')
            return [];
        if (!Array.isArray(rawRules)) {
            warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}" should be an array of { from, to } objects.`);
            return [];
        }
        const rules: CompiledPlaintextSubstitutionRule[] = [];
        const ruleList: unknown = rawRules;
        (ruleList as RuleListCandidate).forEach((rawRule, index) => {
            if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${index}]" should be an object with from and to strings.`);
                return;
            }
            const candidate = rawRule as PlaintextSubstitutionConfigurationCandidate;
            const from = candidate.from;
            const to = candidate.to;
            if (typeof from !== 'string') {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${index}].from" should be a plaintext string.`);
                return;
            }
            if (typeof to !== 'string') {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${index}].to" should be a plaintext string.`);
                return;
            }
            if (!from) {
                warn(`[LiveTranslator][Config] settings.jsonc "${settingPath}[${index}].from" is empty and was ignored.`);
                return;
            }
            if (from.includes(TRANSLATION_MARKER) || to.includes(TRANSLATION_MARKER)) {
                warn(`[LiveTranslator][Config] "${settingPath}[${index}]" cannot consume or introduce formatting markers.`);
                return;
            }
            rules.push({
                index,
                from,
                to,
            });
        });
        return rules;
    }
    function applySubstitutePlaintextBeforeTranslationRules(text: unknown, rules: unknown): unknown {
        const rulesValue = rules as FalsySensitiveValue;
        if (!rulesValue || !(rules as {
            readonly length?: unknown;
        }).length) {
            const stringText = (text ?? '') as StringCoercionCandidate;
            return String(stringText);
        }
        const stringText = (text ?? '') as StringCoercionCandidate;
        let output: unknown = String(stringText);
        for (const rule of rules as Iterable<unknown>) {
            const candidate = rule as PlaintextSubstitutionConfigurationCandidate;
            if (!rule || !candidate.from)
                continue;
            output = (output as SplittableCandidate).split(candidate.from).join(candidate.to);
        }
        return output;
    }
    function createReadonlyTranslationMap(source: unknown, projectValue: unknown = null): ReadonlyTranslationMap {
        if (!source || typeof source !== 'object') {
            throw new TypeError('[TranslationService] A translation collection owner must be an object.');
        }
        const candidate = source as TranslationMapSourceCandidate;
        const has = candidate.has;
        const get = candidate.get;
        const entries = candidate.entries;
        if (typeof has !== 'function' || typeof get !== 'function' || typeof entries !== 'function') {
            throw new TypeError('[TranslationService] A translation collection owner is missing read capabilities.');
        }
        const hasFunction = has as RuntimeFunction;
        const getFunction = get as RuntimeFunction;
        const entriesFunction = entries as RuntimeFunction;
        if (projectValue !== null && projectValue !== undefined && typeof projectValue !== 'function') {
            throw new TypeError('[TranslationService] A translation collection projector must be a function.');
        }
        const project: TranslationMapValueProjector = typeof projectValue === 'function'
            ? (projectValue as TranslationMapValueProjector)
            : (value: unknown): unknown => value;
        function snapshot(): TranslationMapSnapshot {
            const rows: TranslationMapEntry[] = [];
            const iterable = Reflect.apply(entriesFunction, source, []) as Iterable<unknown>;
            for (const entry of iterable) {
                if (!Array.isArray(entry) || entry.length < 2) {
                    throw new TypeError('[TranslationService] A translation collection entry must be a key/value pair.');
                }
                const pair: readonly unknown[] = entry;
                const key = pair[0];
                rows.push(Object.freeze([key, Reflect.apply(project, undefined, [pair[1], key])]));
            }
            return Object.freeze({
                size: rows.length,
                entries: Object.freeze(rows),
            });
        }
        return Object.freeze({
            get size(): number {
                const size = candidate.size;
                if (!Number.isSafeInteger(size) || (size as number) < 0) {
                    throw new TypeError('[TranslationService] A translation collection size must be a safe integer.');
                }
                return size as number;
            },
            has(key: unknown): boolean {
                return Reflect.apply(hasFunction, source, [key]) === true;
            },
            get(key: unknown): unknown {
                if (Reflect.apply(hasFunction, source, [key]) !== true)
                    return undefined;
                return Reflect.apply(project, undefined, [Reflect.apply(getFunction, source, [key]), key]);
            },
            snapshot,
        });
    }
    function createCompletedTranslationMap(isIgnored: unknown): CompletedTranslationMap {
        const shouldHide: IgnorePredicate = typeof isIgnored === 'function' ? (isIgnored as IgnorePredicate) : () => false;
        const entries = new Map<unknown, unknown>();
        const subscribers = new Set<TranslationMapSubscriber>();
        const evictionAuthorities = new WeakMap<object, object>();
        const aliasBatchAuthorities = new WeakMap<object, {
            readonly generation: object;
            readonly mutations: readonly {
                readonly key: unknown;
                readonly value: unknown;
                readonly visible: boolean;
            }[];
            readonly visibility: Map<unknown, boolean>;
            readonly protectedAliases: readonly unknown[];
            readonly capacity: number | null;
        }>();
        let mutationGeneration: object = {};
        let publicationActive = false;
        let publicationPending = false;
        function advanceMutationGeneration(): void {
            mutationGeneration = {};
        }
        function isVisible(key: unknown): boolean {
            return !shouldHide(key);
        }
        function captureVisibleEntriesFrom(source: ReadonlyMap<unknown, unknown>): TranslationMapEntry[] {
            const visible: TranslationMapEntry[] = [];
            for (const [key, value] of source) {
                if (!isVisible(key))
                    continue;
                visible.push(Object.freeze([key, value]));
            }
            return visible;
        }
        function captureVisibleEntries(): TranslationMapEntry[] {
            return captureVisibleEntriesFrom(entries);
        }
        function snapshotEntries(source: ReadonlyMap<unknown, unknown>): TranslationMapSnapshot {
            const visible = captureVisibleEntriesFrom(source);
            return Object.freeze({
                size: visible.length,
                entries: Object.freeze(visible),
            });
        }
        function snapshot(): TranslationMapSnapshot {
            return snapshotEntries(entries);
        }
        function captureIntentKeys(intent: unknown): unknown[] {
            if (typeof intent !== 'object' || intent === null)
                throw new TypeError('intent');
            const keys = (intent as {
                readonly keys?: unknown;
            }).keys;
            if (!Array.isArray(keys))
                throw new TypeError('keys');
            const capturedKeys: unknown[] = [];
            const keyCount = keys.length;
            for (let index = 0; index < keyCount; index += 1)
                capturedKeys.push(keys[index]);
            return capturedKeys;
        }
        function applyAliasMutations(target: Map<unknown, unknown>, mutations: readonly {
            readonly key: unknown;
            readonly value: unknown;
            readonly visible: boolean;
        }[]): boolean {
            let changed = false;
            for (const mutation of mutations) {
                if (!mutation.visible) {
                    if (target.delete(mutation.key))
                        changed = true;
                    continue;
                }
                const unchanged = target.has(mutation.key) && Object.is(target.get(mutation.key), mutation.value);
                target.set(mutation.key, mutation.value);
                if (!unchanged)
                    changed = true;
            }
            return changed;
        }
        function captureVisibleEntriesWithKnownPolicy(source: ReadonlyMap<unknown, unknown>, visibility: Map<unknown, boolean>): TranslationMapEntry[] {
            const visible: TranslationMapEntry[] = [];
            for (const [key, value] of source) {
                const known = visibility.has(key);
                const admitted = known ? visibility.get(key) === true : isVisible(key);
                if (!known)
                    visibility.set(key, admitted);
                if (!admitted)
                    continue;
                visible.push(Object.freeze([key, value]));
            }
            return visible;
        }
        function prepareAliasBatch(groups: readonly CompletedTranslationAliasGroup[], capacity: number | null): PreparedCompletedTranslationBatch {
            if (!Array.isArray(groups)) {
                throw new TypeError('[TranslationService] A completed-cache alias batch must be an array.');
            }
            if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1)) {
                throw new TypeError('[TranslationService] A completed-cache capacity must be a positive safe integer or null.');
            }
            const capturedGroups: {
                readonly aliases: readonly unknown[];
                readonly value: unknown;
            }[] = [];
            const groupEntries = groups as readonly CompletedTranslationAliasGroup[];
            const groupCount = groups.length;
            for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
                const group = groupEntries[groupIndex];
                if (!group || typeof group !== 'object') {
                    throw new TypeError('[TranslationService] A completed-cache alias batch entry must be an object.');
                }
                const aliases = group.aliases;
                const value = group.value;
                if (!Array.isArray(aliases)) {
                    throw new TypeError('[TranslationService] A completed-cache alias group must be an array.');
                }
                const capturedAliases: unknown[] = [];
                const aliasEntries = aliases as readonly unknown[];
                const aliasCount = aliases.length;
                for (let aliasIndex = 0; aliasIndex < aliasCount; aliasIndex += 1) {
                    capturedAliases.push(aliasEntries[aliasIndex]);
                }
                capturedGroups.push(Object.freeze({ aliases: Object.freeze(capturedAliases), value }));
            }
            const preparedGeneration = mutationGeneration;
            const effectiveMutations = new Map<unknown, {
                readonly key: unknown;
                readonly value: unknown;
                readonly visible: boolean;
            }>();
            const visibility = new Map<unknown, boolean>();
            const admittedGroups: unknown[][] = [];
            for (const group of capturedGroups) {
                const admittedAliases: unknown[] = [];
                const admittedInGroup = new Set<unknown>();
                for (const alias of group.aliases) {
                    const known = visibility.has(alias);
                    const visible = known ? visibility.get(alias) === true : isVisible(alias);
                    if (!known)
                        visibility.set(alias, visible);
                    effectiveMutations.set(alias, Object.freeze({ key: alias, value: group.value, visible }));
                    if (visible && !admittedInGroup.has(alias)) {
                        admittedInGroup.add(alias);
                        admittedAliases.push(alias);
                    }
                }
                admittedGroups.push(admittedAliases);
            }
            const mutations = Object.freeze(Array.from(effectiveMutations.values()));
            const protectedAliases: unknown[] = [];
            const protectedSet = new Set<unknown>();
            const protectionLimit = capacity ?? Number.MAX_SAFE_INTEGER;
            for (let groupIndex = admittedGroups.length - 1; groupIndex >= 0; groupIndex -= 1) {
                const admittedGroup = admittedGroups[groupIndex];
                if (!admittedGroup)
                    continue;
                for (const alias of admittedGroup) {
                    if (protectedSet.has(alias))
                        continue;
                    protectedSet.add(alias);
                    protectedAliases.push(alias);
                    if (protectedAliases.length >= protectionLimit)
                        break;
                }
                if (protectedAliases.length >= protectionLimit)
                    break;
            }
            let preparedSnapshot: TranslationMapSnapshot | null = null;
            if (capacity !== null) {
                const staged = new Map(entries);
                applyAliasMutations(staged, mutations);
                const visible = captureVisibleEntriesWithKnownPolicy(staged, visibility);
                preparedSnapshot = Object.freeze({ size: visible.length, entries: Object.freeze(visible) });
            }
            const prepared = Object.freeze({ snapshot: preparedSnapshot });
            aliasBatchAuthorities.set(prepared, {
                generation: preparedGeneration,
                mutations,
                visibility,
                protectedAliases: Object.freeze(protectedAliases),
                capacity,
            });
            return prepared;
        }
        function commitAliasBatch(prepared: unknown, intent: unknown = null): boolean {
            if (!prepared || typeof prepared !== 'object') {
                throw new TypeError('[TranslationService] A completed-cache alias commit requires preparation.');
            }
            const authority = aliasBatchAuthorities.get(prepared);
            if (!authority) {
                throw new TypeError('[TranslationService] A completed-cache alias preparation is invalid.');
            }
            aliasBatchAuthorities.delete(prepared);
            const policyGeneration = mutationGeneration;
            let policyKeys: unknown[] = [];
            if (authority.generation === policyGeneration && intent !== null && intent !== undefined) {
                try {
                    const captured = captureIntentKeys(intent);
                    if (policyGeneration === mutationGeneration)
                        policyKeys = captured;
                }
                catch {
                }
            }
            if (authority.capacity === null) {
                const changed = applyAliasMutations(entries, authority.mutations);
                if (!changed)
                    return false;
                advanceMutationGeneration();
                publishChange();
                return true;
            }
            const stagingGeneration = mutationGeneration;
            const staged = new Map(entries);
            applyAliasMutations(staged, authority.mutations);
            const protectedAliases = new Set<unknown>();
            const retainedAliasCount = Math.min(authority.capacity, authority.protectedAliases.length);
            for (let index = 0; index < retainedAliasCount; index += 1) {
                protectedAliases.add(authority.protectedAliases[index]);
            }
            for (const key of policyKeys) {
                if (!protectedAliases.has(key))
                    staged.delete(key);
            }
            const visibleRows = captureVisibleEntriesWithKnownPolicy(staged, authority.visibility);
            let excess = visibleRows.length - authority.capacity;
            for (let index = 0; excess > 0 && index < visibleRows.length; index += 1) {
                const key = visibleRows[index]?.[0];
                if (protectedAliases.has(key))
                    continue;
                if (staged.delete(key))
                    excess -= 1;
            }
            if (stagingGeneration !== mutationGeneration) {
                throw new Error('[TranslationService] Completed-cache policy reentered during alias staging.');
            }
            let changed = entries.size !== staged.size;
            if (!changed) {
                const current = entries.entries();
                for (const [replacementKey, replacementValue] of staged) {
                    const currentEntry = current.next();
                    if (currentEntry.done ||
                        !Object.is(currentEntry.value[0], replacementKey) ||
                        !Object.is(currentEntry.value[1], replacementValue)) {
                        changed = true;
                        break;
                    }
                }
            }
            if (!changed)
                return false;
            entries.clear();
            for (const [key, value] of staged)
                entries.set(key, value);
            advanceMutationGeneration();
            publishChange();
            return true;
        }
        function prepareEviction(): PreparedTranslationMapEviction {
            const preparedGeneration = mutationGeneration;
            const prepared = Object.freeze({ snapshot: snapshot() });
            evictionAuthorities.set(prepared, preparedGeneration);
            return prepared;
        }
        function publishChange(): void {
            publicationPending = true;
            if (publicationActive || subscribers.size === 0)
                return;
            publicationActive = true;
            try {
                while (publicationPending) {
                    publicationPending = false;
                    let published: TranslationMapSnapshot;
                    try {
                        published = snapshot();
                    }
                    catch {
                        continue;
                    }
                    const publicationSubscribers = Array.from(subscribers);
                    for (const subscriber of publicationSubscribers) {
                        if (!subscribers.has(subscriber))
                            continue;
                        try {
                            Reflect.apply(subscriber, undefined, [published]);
                        }
                        catch {
                        }
                    }
                }
            }
            finally {
                publicationActive = false;
            }
        }
        function applyEvictionIntent(prepared: unknown, intent: unknown): number {
            if (!prepared || typeof prepared !== 'object') {
                throw new TypeError('[TranslationService] A completed-cache eviction requires prepared authority.');
            }
            const preparedGeneration = evictionAuthorities.get(prepared);
            if (preparedGeneration === undefined) {
                throw new TypeError('[TranslationService] A completed-cache eviction authority is invalid.');
            }
            evictionAuthorities.delete(prepared);
            if (preparedGeneration !== mutationGeneration)
                return 0;
            if (intent === null || intent === undefined)
                return 0;
            if (typeof intent !== 'object') {
                throw new TypeError('[TranslationService] A completed-cache eviction intent must be an object.');
            }
            const keys = (intent as {
                readonly keys?: unknown;
            }).keys;
            if (!Array.isArray(keys)) {
                throw new TypeError('[TranslationService] A completed-cache eviction intent requires a keys array.');
            }
            const evictionKeys: unknown[] = [];
            const keyCount = keys.length;
            for (let index = 0; index < keyCount; index += 1) {
                evictionKeys.push(keys[index]);
            }
            if (preparedGeneration !== mutationGeneration)
                return 0;
            let deleted = 0;
            for (let index = 0; index < keyCount; index += 1) {
                if (entries.delete(evictionKeys[index]))
                    deleted += 1;
            }
            if (deleted > 0) {
                advanceMutationGeneration();
                publishChange();
            }
            return deleted;
        }
        function has(key: unknown): boolean {
            return isVisible(key) && entries.has(key);
        }
        function get(key: unknown): unknown {
            return isVisible(key) ? entries.get(key) : undefined;
        }
        function lookup(key: unknown): CompletedTranslationLookup {
            if (!isVisible(key) || !entries.has(key)) {
                return Object.freeze({ found: false, value: undefined });
            }
            return Object.freeze({ found: true, value: entries.get(key) });
        }
        function set(key: unknown, value: unknown): CompletedTranslationMap {
            if (!isVisible(key)) {
                if (entries.delete(key)) {
                    advanceMutationGeneration();
                    publishChange();
                }
                return owner;
            }
            const unchanged = entries.has(key) && Object.is(entries.get(key), value);
            entries.set(key, value);
            if (!unchanged) {
                advanceMutationGeneration();
                publishChange();
            }
            return owner;
        }
        function deleteEntry(key: unknown): boolean {
            const visible = isVisible(key);
            const deleted = entries.delete(key);
            if (deleted) {
                advanceMutationGeneration();
                publishChange();
            }
            return visible && deleted;
        }
        function clear(): void {
            if (entries.size === 0)
                return;
            entries.clear();
            advanceMutationGeneration();
            publishChange();
        }
        function visibleEntries(): IterableIterator<TranslationMapEntry> {
            return captureVisibleEntries()[Symbol.iterator]();
        }
        function keys(): IterableIterator<unknown> {
            const visibleKeys = captureVisibleEntries().map((entry) => entry[0]);
            return visibleKeys[Symbol.iterator]();
        }
        function values(): IterableIterator<unknown> {
            const visibleValues = captureVisibleEntries().map((entry) => entry[1]);
            return visibleValues[Symbol.iterator]();
        }
        function forEach(callback: unknown, thisArg?: unknown): void {
            if (typeof callback !== 'function') {
                throw new TypeError('[TranslationService] A completed-cache iterator callback must be a function.');
            }
            for (const [key, value] of captureVisibleEntries()) {
                Reflect.apply(callback as RuntimeFunction, thisArg, [value, key, owner]);
            }
        }
        function subscribe(listener: unknown): () => boolean {
            if (typeof listener !== 'function') {
                throw new TypeError('[TranslationService] A completed-cache subscriber must be a function.');
            }
            const subscriber = listener as TranslationMapSubscriber;
            subscribers.add(subscriber);
            let active = true;
            return (): boolean => {
                if (!active)
                    return false;
                active = false;
                return subscribers.delete(subscriber);
            };
        }
        const readonlyView: ReadonlyCompletedTranslationMap = Object.freeze({
            get size(): number {
                return captureVisibleEntries().length;
            },
            has,
            get,
            snapshot,
            subscribe,
        });
        const owner: CompletedTranslationMap = Object.freeze({
            get size(): number {
                return captureVisibleEntries().length;
            },
            readonlyView,
            has,
            get,
            lookup,
            set,
            delete: deleteEntry,
            clear,
            entries: visibleEntries,
            keys,
            values,
            forEach,
            snapshot,
            prepareEviction,
            applyEvictionIntent,
            prepareAliasBatch,
            commitAliasBatch,
            [Symbol.iterator]: visibleEntries,
        });
        return owner;
    }
    return {
        normalizeCacheKey,
        deriveCacheKeyAliases,
        compileSubstitutePlaintextBeforeTranslationRules,
        applySubstitutePlaintextBeforeTranslationRules,
        createReadonlyTranslationMap,
        createCompletedTranslationMap,
    };
}
