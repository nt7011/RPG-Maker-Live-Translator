// Shared helper functions for Window lifecycle hook modules.
(() => {
    'use strict';

    // Small shared helpers used by the lifecycle hook split files.
    LiveTranslatorDefine({
        name: 'hooks.window.lifecycleHelpers',
        requires: {
            hookWrapper: 'runtime.hookWrapper',
        },
        factory({ hookWrapper }) {

            return {
                hasHookInChain: hookWrapper.hasHookInChain,
            };
        },
    });

})();
