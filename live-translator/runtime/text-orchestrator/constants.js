// Text orchestrator shared constants.
// Keeping policy and lifecycle constants here makes the facade and support modules agree on one vocabulary.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function' || typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/constants.js.');
    }

    const textLifecycle = requireRuntimeModule('runtime.textLifecycle');
    const ACTIVE_STATUSES = textLifecycle.ACTIVE_STATUSES;
    const STATUS_ALIASES = textLifecycle.STATUS_ALIASES;
    const DEFAULT_EVENT_LIMIT = 500;
    const DEFAULT_ITEM_EVENT_LIMIT = 80;
    const DEFAULT_ARCHIVED_LIMIT = 300;
    const DEFAULT_RENDER_COMMAND_LIMIT = 200;
    const DEFAULT_TEXT_ELIGIBILITY_SETTINGS = {
        skipEmpty: true,
        skipNative: true,
        skipCounterLike: true,
        skipSkipped: true,
        skipKorean: true,
        requireJapaneseOrChinese: true,
    };
    const OWNERSHIP_PRIORITY = Object.freeze({
        message: 5000,
        window: 4000,
        sprite: 3000,
        pixi: 2000,
        bitmap: 1000,
        text: 0,
    });

    defineRuntimeModule('runtime.textOrchestratorConstants', {
        ACTIVE_STATUSES,
        STATUS_ALIASES,
        DEFAULT_EVENT_LIMIT,
        DEFAULT_ITEM_EVENT_LIMIT,
        DEFAULT_ARCHIVED_LIMIT,
        DEFAULT_RENDER_COMMAND_LIMIT,
        DEFAULT_TEXT_ELIGIBILITY_SETTINGS,
        OWNERSHIP_PRIORITY,
    });
})();
