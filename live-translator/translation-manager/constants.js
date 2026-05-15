// Translation manager shared constants.
// Queue, cache, and provider helpers import these names so policy values stay aligned.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before translation-manager/constants.js.');
    }

    const IGNORE_REGEX_SETTING = 'ignoreTranslationRegex';
    const OVERRIDE_REGEX_SETTING = 'overrideTranslationRegex';
    const SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING = 'substitutePlaintextBeforeTranslation';
    const IGNORE_REGEX_FLAG_ORDER = ['i', 'm', 's', 'u'];
    const OPTIONAL_IGNORE_REGEX_FLAGS = { i: true, m: true, s: true, u: true };
    const RAW_CONTROL_CODE_PATTERN = /\\(?:[A-Za-z0-9_#]+|[^\s\w])(?:\[[^\]]*\]|<[^>]*>)?/gu;
    const DEFAULT_PRIORITY = 500;
    const MAX_PRIORITY = 1000;
    const MIN_PRIORITY = 0;
    const DEFAULT_MAX_RETRIES = 2;
    const DEFAULT_RETRY_BASE_MS = 500;
    const DEFAULT_RETRY_MAX_MS = 8000;
    const DEFAULT_CAPACITY_REFRESH_MS = 5000;
    const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
    const DEFAULT_RESERVED_PRIORITY_LANES = [{
        name: 'priority1000',
        enabledAtCapacity: 3,
        reservedSlots: 1,
        priority: MAX_PRIORITY,
        blocksNormalDispatch: true,
    }];
    const HOOK_PRIORITIES = {
        message: 1000,
        game_message: 1000,
        pixi: 750,
        window: 650,
        drawText: 650,
        drawTextEx: 650,
        sprite_text: 550,
        sprite: 550,
        bitmap: 450,
        precache: 100,
    };

    defineRuntimeModule('runtime.translationManagerConstants', {
        IGNORE_REGEX_SETTING,
        OVERRIDE_REGEX_SETTING,
        SUBSTITUTE_PLAINTEXT_BEFORE_TRANSLATION_SETTING,
        IGNORE_REGEX_FLAG_ORDER,
        OPTIONAL_IGNORE_REGEX_FLAGS,
        RAW_CONTROL_CODE_PATTERN,
        DEFAULT_PRIORITY,
        MAX_PRIORITY,
        MIN_PRIORITY,
        DEFAULT_MAX_RETRIES,
        DEFAULT_RETRY_BASE_MS,
        DEFAULT_RETRY_MAX_MS,
        DEFAULT_CAPACITY_REFRESH_MS,
        DEFAULT_REQUEST_TIMEOUT_MS,
        DEFAULT_RESERVED_PRIORITY_LANES,
        HOOK_PRIORITIES,
    });
})();
