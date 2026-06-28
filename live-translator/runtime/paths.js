// Runtime path context accessor.
// Loader resolves the game/support/log/cache locations once, and other modules read that shared context here.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.paths',
        factory(_dependencies, { scope }) {
            function clonePathContext(paths) {
                return Object.assign({}, paths && typeof paths === 'object' ? paths : {});
            }

            function getPathContext() {
                return clonePathContext(scope.LiveTranslatorPaths);
            }

            function setPathContext(paths) {
                const next = clonePathContext(paths);
                scope.LiveTranslatorPaths = next;
                return getPathContext();
            }

            function getPath(name) {
                const paths = getPathContext();
                return typeof paths[name] === 'string' ? paths[name] : '';
            }

            return {
                getPathContext,
                setPathContext,
                getPath,
            };
        },
    });
})();
