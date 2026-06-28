// Shared lifecycle reason constants for adapter/runtime boundaries.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.lifecycleReasons',
        factory() {
            const reasons = Object.freeze({
                CONTENTS_REPLACED: 'contents-replaced',
                NOT_CURRENT_SCENE: 'not-current-scene',
                SCENE_TERMINATED: 'scene-terminated',
                WINDOW_DESTROYED: 'window-destroyed',
                WINDOW_DETACHED: 'window-detached',
                WINDOW_OFFSCREEN: 'window-offscreen',
                WINDOW_STALE: 'window-stale',
                WINDOW_UNREGISTERED: 'window-unregistered',
                WINDOW_VISIBLE: 'window-visible',
            });

            return {
                reasons,
            };
        },
    });
})();
