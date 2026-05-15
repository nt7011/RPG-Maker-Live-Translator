// Text orchestrator shared constants.
// Keeping policy and lifecycle constants here makes the facade and support modules agree on one vocabulary.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/constants.js.');
    }

    const ACTIVE_STATUSES = {
        detected: true,
        pending: true,
        translating: true,
        completed: true,
        skipped: true,
        failed: true,
    };
    const STATUS_ALIASES = {
        requested: 'pending',
        request: 'pending',
        failed: 'failed',
        error: 'failed',
        canceled: 'stale',
        cancelled: 'stale',
        gone: 'disappeared',
    };
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
