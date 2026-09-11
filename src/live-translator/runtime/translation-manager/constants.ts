export interface ReservedPriorityLaneDefinition {
    readonly name: string;
    readonly enabledAtCapacity: number;
    readonly reservedSlots: number;
    readonly maxConcurrent: number;
    readonly priority: number;
    readonly hooks?: readonly string[];
    readonly blocksNormalDispatch: boolean;
}
export interface TranslationManagerConstantsModule {
    readonly IGNORE_REGEX_SETTING: 'ignoreTranslationRegex';
    readonly OVERRIDE_REGEX_SETTING: 'overrideTranslationRegex';
    readonly SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING: 'substitutePlaintextBeforeTranslation';
    readonly DEFAULT_PRIORITY: number;
    readonly MAX_PRIORITY: number;
    readonly MIN_PRIORITY: number;
    readonly DEFAULT_MAX_RETRIES: number;
    readonly DEFAULT_RETRY_BASE_MS: number;
    readonly DEFAULT_RETRY_MAX_MS: number;
    readonly DEFAULT_CAPACITY_REFRESH_MS: number;
    readonly DEFAULT_REQUEST_TIMEOUT_MS: number;
    readonly DEFAULT_RESERVED_PRIORITY_LANES: readonly ReservedPriorityLaneDefinition[];
    readonly HOOK_PRIORITIES: Readonly<Record<string, number>>;
}
export function createTranslationManagerConstantsModule(): TranslationManagerConstantsModule {
    const MAX_PRIORITY = 1000;
    return {
        IGNORE_REGEX_SETTING: 'ignoreTranslationRegex',
        OVERRIDE_REGEX_SETTING: 'overrideTranslationRegex',
        SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING: 'substitutePlaintextBeforeTranslation',
        DEFAULT_PRIORITY: 500,
        MAX_PRIORITY,
        MIN_PRIORITY: 0,
        DEFAULT_MAX_RETRIES: 2,
        DEFAULT_RETRY_BASE_MS: 500,
        DEFAULT_RETRY_MAX_MS: 8000,
        DEFAULT_CAPACITY_REFRESH_MS: 5000,
        DEFAULT_REQUEST_TIMEOUT_MS: 120000,
        DEFAULT_RESERVED_PRIORITY_LANES: [
            {
                name: 'priority-1000',
                enabledAtCapacity: 3,
                reservedSlots: 1,
                maxConcurrent: Number.MAX_SAFE_INTEGER,
                priority: 1000,
                blocksNormalDispatch: false,
            },
        ],
        HOOK_PRIORITIES: {
            bitmap: 500,
        },
    };
}
