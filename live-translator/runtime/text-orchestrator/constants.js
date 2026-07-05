// Text orchestrator shared constants.
// Keeping policy and lifecycle constants here makes the facade and support modules agree on one vocabulary.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.textOrchestrator.constants',
        requires: {
            textLifecycle: 'runtime.textLifecycle',
            adapterMetadata: 'runtime.adapterMetadata',
        },
        factory({ textLifecycle, adapterMetadata }) {
            const ACTIVE_STATUSES = textLifecycle.ACTIVE_STATUSES;
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
            const OWNERSHIP_PRIORITY = adapterMetadata.getOwnershipPriorityMap();

            return {
                ACTIVE_STATUSES,
                DEFAULT_EVENT_LIMIT,
                DEFAULT_ITEM_EVENT_LIMIT,
                DEFAULT_ARCHIVED_LIMIT,
                DEFAULT_RENDER_COMMAND_LIMIT,
                DEFAULT_TEXT_ELIGIBILITY_SETTINGS,
                OWNERSHIP_PRIORITY,
            };
        },
    });
})();
