// Internal composition store for Foresight scanner support parts.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.foresight.partsRegistry',
        factory() {
            const parts = Object.create(null);

            return Object.freeze({
                getParts() {
                    return parts;
                },
            });
        },
    });
})();
